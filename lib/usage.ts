import { NextResponse } from "next/server";
import type { UsageFeature, SubscriptionPlan } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  planFeatureLimit,
  currentPeriod,
  overageFeeMdl,
  FEATURE_LABEL_RO,
  type LimitedFeature,
} from "@/lib/plan-limits";

export type UsageResult =
  | { ok: true; viaOverage?: boolean; viaSingleAccess?: boolean }
  | {
      ok: false;
      reason: "unavailable" | "limit";
      used: number;
      limit: number;
      // Доплата sobre-limit (MDL) за это превышение, либо null — если для фичи/плана
      // доплата не предусмотрена (тогда роут отдаёт жёсткий блок). Только при reason:"limit".
      overageFeeMdl: number | null;
      // План пользователя (при reason:"limit") — чтобы текст об исчерпании не предлагал
      // «treceți la Pro» на HUB (у Pro лимит меньше).
      plan?: SubscriptionPlan | null;
    };

// Есть ли у пользователя оплаченный НЕпотраченный грант sobre-limit по фиче? Если да —
// «тратит» его (overageConsumedAt=now) и возвращает true. Грант существует ТОЛЬКО при
// status=PAID (ставится callback'ом после реального захвата средств) — поэтому брошенная
// оплата (PENDING) действие НЕ пропускает (защита от money leak).
async function consumeOverageGrant(
  userId: string,
  feature: UsageFeature,
): Promise<boolean> {
  const grant = await prisma.payment.findFirst({
    where: {
      userId,
      purpose: "OVERAGE",
      overageFeature: feature,
      status: "PAID",
      overageConsumedAt: null,
    },
    orderBy: { createdAt: "asc" }, // тратим самый старый грант первым
    select: { id: true },
  });
  if (!grant) return false;
  await prisma.payment.update({
    where: { id: grant.id },
    data: { overageConsumedAt: new Date() },
  });
  return true;
}

// «O accesare» (Этап C): есть ли непотраченный SingleAccessGrant на фичу? Если да — «тратит»
// его (consumedAt=now) one-shot и возвращает true. Гранты создаются callback'ом только при
// PAID — брошенная оплата их не выдаёт. Позволяет plan=null пользователю сделать ровно одно
// действие по фиче (CADASTRU_CHECK / DOSAR_ANALYSIS / OBIECTE_CREATE).
async function consumeSingleAccessGrant(
  userId: string,
  feature: UsageFeature,
): Promise<boolean> {
  const grant = await prisma.singleAccessGrant.findFirst({
    where: { userId, feature, consumedAt: null },
    orderBy: { createdAt: "asc" }, // тратим самый старый грант первым
    select: { id: true },
  });
  if (!grant) return false;
  await prisma.singleAccessGrant.update({
    where: { id: grant.id },
    data: { consumedAt: new Date() },
  });
  return true;
}

// Есть ли у пользователя хоть один непотраченный грант «O accesare» (любой фичи).
// Используется для JWT-claim hasSingleAccess (WAITLIST-гейт).
export async function hasUnconsumedSingleAccess(userId: string): Promise<boolean> {
  const n = await prisma.singleAccessGrant.count({
    where: { userId, consumedAt: null },
  });
  return n > 0;
}

// Списывает 1 единицу накопительной фичи (UsageCounter). ADMIN и безлимит — без записи.
// План отсутствует / фича недоступна (limit 0) → { ok:false, reason:"unavailable" }.
// Достигнут лимит → { ok:false, reason:"limit", used, limit }. Само-сброс при истёкшем
// периоде (cron reset-usage — подстраховка). НЕ атомарно (паритет с прежним analyze-роутом).
export async function consumeUsage(
  userId: string,
  feature: UsageFeature,
): Promise<UsageResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planActivatedAt: true, role: true, createdAt: true },
  });
  if (!user) return { ok: false, reason: "unavailable", used: 0, limit: 0, overageFeeMdl: null };
  if (user.role === "ADMIN") return { ok: true };

  const limit = planFeatureLimit(user.plan, feature as LimitedFeature);
  if (limit === 0) {
    // plan=null покупатель «O accesare»: непотраченный грант на эту фичу пропускает одно
    // действие (CADASTRU_CHECK / DOSAR_ANALYSIS). Для ANUNT_999 грантов нет → останется unavailable.
    if (await consumeSingleAccessGrant(userId, feature)) {
      return { ok: true, viaSingleAccess: true };
    }
    return { ok: false, reason: "unavailable", used: 0, limit: 0, overageFeeMdl: null };
  }
  if (!Number.isFinite(limit)) return { ok: true }; // безлимит — не считаем

  const now = new Date();
  const anchor = user.planActivatedAt ?? user.createdAt;
  const { start, end } = currentPeriod(anchor, now);

  const existing = await prisma.usageCounter.findUnique({
    where: { userId_feature: { userId, feature } },
  });
  const samePeriod = !!existing && existing.periodStart.getTime() === start.getTime();
  const used = samePeriod ? existing!.count : 0;
  if (used >= limit) {
    // Лимит исчерпан. Сначала — оплаченный одноразовый грант sobre-limit (если есть):
    // тратим его и пропускаем действие (счётчик НЕ инкрементируем — он уже на лимите).
    if (await consumeOverageGrant(userId, feature)) {
      return { ok: true, viaOverage: true };
    }
    // Гранта нет → блок. overageFeeMdl != null → роут предложит доплату (402); иначе — 429.
    return {
      ok: false,
      reason: "limit",
      used,
      limit,
      overageFeeMdl: overageFeeMdl(user.plan, feature as LimitedFeature),
      plan: user.plan,
    };
  }

  await prisma.usageCounter.upsert({
    where: { userId_feature: { userId, feature } },
    create: { userId, feature, count: 1, periodStart: start, periodEnd: end },
    update: samePeriod
      ? { count: { increment: 1 } }
      : { count: 1, periodStart: start, periodEnd: end },
  });
  return { ok: true };
}

// ── Резерв/возврат единицы лимита (для действий, которые могут не удаться) ──────
// consumeUsage списывает необратимо — годится, когда действие гарантированно выполняется.
// Для внешних вызовов (кадастр) используем резерв: reserveUsage до вызова, releaseUsage
// при любой неудаче (в finally). Резерв берётся ровно из одного источника:
//   • none     — ADMIN / безлимит (Pro, HUB): ничего не списано, возвращать нечего;
//   • counter  — единица UsageCounter текущего периода;
//   • single   — оплаченный грант «O accesare» (SingleAccessGrant.consumedAt);
//   • overage  — оплаченный грант sobre-limit (Payment.overageConsumedAt).
// Каждая операция — один условный UPDATE: в Postgres параллельный UPDATE той же строки
// ждёт коммита и заново проверяет WHERE, поэтому при исчерпанном лимите параллельные
// запросы не проскакивают (count < limit перепроверяется), а один грант не тратится дважды.
export type UsageReservation =
  | { kind: "none" }
  | { kind: "counter"; userId: string; feature: UsageFeature; periodStart: Date }
  | { kind: "single"; grantId: string }
  | { kind: "overage"; paymentId: string };

export type ReserveResult =
  | { ok: true; reservation: UsageReservation }
  | Extract<UsageResult, { ok: false }>;

// Сколько раз пробуем забрать грант, если параллельный запрос забрал выбранный первым.
const GRANT_TAKE_ATTEMPTS = 5;

async function takeSingleAccessGrant(userId: string, feature: UsageFeature): Promise<string | null> {
  for (let i = 0; i < GRANT_TAKE_ATTEMPTS; i++) {
    const g = await prisma.singleAccessGrant.findFirst({
      where: { userId, feature, consumedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!g) return null;
    const taken = await prisma.singleAccessGrant.updateMany({
      where: { id: g.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (taken.count === 1) return g.id;
  }
  return null;
}

async function takeOverageGrant(userId: string, feature: UsageFeature): Promise<string | null> {
  for (let i = 0; i < GRANT_TAKE_ATTEMPTS; i++) {
    const g = await prisma.payment.findFirst({
      where: { userId, purpose: "OVERAGE", overageFeature: feature, status: "PAID", overageConsumedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!g) return null;
    const taken = await prisma.payment.updateMany({
      where: { id: g.id, status: "PAID", overageConsumedAt: null },
      data: { overageConsumedAt: new Date() },
    });
    if (taken.count === 1) return g.id;
  }
  return null;
}

export async function reserveUsage(userId: string, feature: UsageFeature): Promise<ReserveResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planActivatedAt: true, role: true, createdAt: true },
  });
  if (!user) return { ok: false, reason: "unavailable", used: 0, limit: 0, overageFeeMdl: null };
  if (user.role === "ADMIN") return { ok: true, reservation: { kind: "none" } };

  const limit = planFeatureLimit(user.plan, feature as LimitedFeature);
  if (limit === 0) {
    const grantId = await takeSingleAccessGrant(userId, feature);
    if (grantId) return { ok: true, reservation: { kind: "single", grantId } };
    return { ok: false, reason: "unavailable", used: 0, limit: 0, overageFeeMdl: null };
  }
  if (!Number.isFinite(limit)) return { ok: true, reservation: { kind: "none" } };

  const { start, end } = currentPeriod(user.planActivatedAt ?? user.createdAt, new Date());

  // 1) Строка-счётчик существует (INSERT … ON CONFLICT DO NOTHING — без гонки на создании).
  await prisma.usageCounter.createMany({
    data: [{ userId, feature, count: 0, periodStart: start, periodEnd: end }],
    skipDuplicates: true,
  });
  // 2) Новый период → обнуляем (идемпотентно: после первого обнуления условие ложно).
  await prisma.usageCounter.updateMany({
    where: { userId, feature, periodStart: { not: start } },
    data: { count: 0, periodStart: start, periodEnd: end },
  });
  // 3) Атомарный инкремент только если остался лимит.
  const inc = await prisma.usageCounter.updateMany({
    where: { userId, feature, periodStart: start, count: { lt: limit } },
    data: { count: { increment: 1 } },
  });
  if (inc.count === 1) {
    return { ok: true, reservation: { kind: "counter", userId, feature, periodStart: start } };
  }

  // Лимит исчерпан → оплаченный грант sobre-limit, если есть.
  const paymentId = await takeOverageGrant(userId, feature);
  if (paymentId) return { ok: true, reservation: { kind: "overage", paymentId } };

  const row = await prisma.usageCounter.findUnique({
    where: { userId_feature: { userId, feature } },
    select: { count: true },
  });
  return {
    ok: false,
    reason: "limit",
    used: row?.count ?? limit,
    limit,
    overageFeeMdl: overageFeeMdl(user.plan, feature as LimitedFeature),
    plan: user.plan,
  };
}

// Возврат резерва. Один условный UPDATE на источник (атомарно). Счётчик возвращается только
// в тот же период, в котором был взят (если период сменился во время вызова — не трогаем
// новый). Вызывать из finally при неудаче действия.
export async function releaseUsage(r: UsageReservation): Promise<void> {
  switch (r.kind) {
    case "none":
      return;
    case "counter":
      await prisma.usageCounter.updateMany({
        where: { userId: r.userId, feature: r.feature, periodStart: r.periodStart, count: { gt: 0 } },
        data: { count: { decrement: 1 } },
      });
      return;
    case "single":
      await prisma.singleAccessGrant.updateMany({
        where: { id: r.grantId, consumedAt: { not: null } },
        data: { consumedAt: null },
      });
      return;
    case "overage":
      await prisma.payment.updateMany({
        where: { id: r.paymentId, overageConsumedAt: { not: null } },
        data: { overageConsumedAt: null },
      });
      return;
  }
}

// Текущее использование накопительной фичи (для UI/админки), без записи.
export async function getUsage(
  userId: string,
  feature: UsageFeature,
): Promise<{ used: number; limit: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planActivatedAt: true, createdAt: true },
  });
  if (!user) return { used: 0, limit: 0 };
  const limit = planFeatureLimit(user.plan, feature as LimitedFeature);
  const counter = await prisma.usageCounter.findUnique({
    where: { userId_feature: { userId, feature } },
  });
  const now = new Date();
  const anchor = user.planActivatedAt ?? user.createdAt;
  const { start } = currentPeriod(anchor, now);
  const used =
    counter && counter.periodStart.getTime() === start.getTime() ? counter.count : 0;
  return { used, limit };
}

// Сводка использования по всем лимитированным фичам — для страницы статуса плана
// (/app/pending для пользователей с планом). Display-ready: limit сериализуется в число
// или null (Infinity), поэтому отдаём готовые флаги/подпись, чтобы не потерять Infinity в JSON.
export type UsageSummaryRow = {
  key: LimitedFeature;
  labelRo: string;
  used: number;
  limit: number; // конечное число; для безлимита см. unlimited
  unlimited: boolean;
  unavailable: boolean; // фича недоступна на плане (limit 0)
};

export async function getUsageSummary(userId: string): Promise<{
  plan: SubscriptionPlan | null;
  planExpiresAt: string | null;
  rows: UsageSummaryRow[];
  singleAccessCount: number;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true },
  });
  const plan = user?.plan ?? null;

  const [cadastru, dosar, creator, anunt, activeObjects, singleAccessCount] =
    await Promise.all([
      getUsage(userId, "CADASTRU_CHECK"),
      getUsage(userId, "DOSAR_ANALYSIS"),
      getUsage(userId, "CREATOR_HUB"),
      getUsage(userId, "ANUNT_999"),
      prisma.transaction.count({ where: { userId, status: { not: "ARCHIVE" } } }),
      prisma.singleAccessGrant.count({ where: { userId, consumedAt: null } }),
    ]);

  const obiecteLimit = planFeatureLimit(plan, "OBIECTE_ACTIVE");
  const row = (key: LimitedFeature, used: number, limit: number): UsageSummaryRow => ({
    key,
    labelRo: FEATURE_LABEL_RO[key],
    used,
    limit: Number.isFinite(limit) ? limit : 0,
    unlimited: !Number.isFinite(limit),
    unavailable: limit === 0,
  });

  return {
    plan,
    planExpiresAt: user?.planExpiresAt?.toISOString() ?? null,
    rows: [
      row("CADASTRU_CHECK", cadastru.used, cadastru.limit),
      row("DOSAR_ANALYSIS", dosar.used, dosar.limit),
      row("OBIECTE_ACTIVE", activeObjects, obiecteLimit),
      row("CREATOR_HUB", creator.used, creator.limit),
      row("ANUNT_999", anunt.used, anunt.limit),
    ],
    singleAccessCount,
  };
}

// OBIECTE_ACTIVE — живой подсчёт активных (неархивированных) досье, а НЕ накопительный
// счётчик. Лимит = сколько досье со статусом != ARCHIVE может существовать одновременно.
// Проверяется при создании нового досье; архивация освобождает слот. Инкремента нет.
export async function checkActiveObjects(userId: string): Promise<UsageResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, role: true },
  });
  // OBIECTE_ACTIVE доплаты sobre-limit НЕ имеет (только dosar/cadastru) → overageFeeMdl:null.
  if (!user) return { ok: false, reason: "unavailable", used: 0, limit: 0, overageFeeMdl: null };
  if (user.role === "ADMIN") return { ok: true };
  const limit = planFeatureLimit(user.plan, "OBIECTE_ACTIVE");
  if (limit === 0) {
    // plan=null покупатель «O accesare»: грант OBIECTE_CREATE разрешает создать ровно 1 досье
    // (one-shot). После траты повторное создание при plan=null без гранта — заблокировано
    // (нет обхода archive→recreate, т.к. грант потребляемый, а не concurrency).
    if (await consumeSingleAccessGrant(userId, "OBIECTE_CREATE")) {
      return { ok: true, viaSingleAccess: true };
    }
    return { ok: false, reason: "unavailable", used: 0, limit: 0, overageFeeMdl: null };
  }
  if (!Number.isFinite(limit)) return { ok: true }; // безлимит (Pro)
  const count = await prisma.transaction.count({
    where: { userId, status: { not: "ARCHIVE" } },
  });
  if (count >= limit) {
    return { ok: false, reason: "limit", used: count, limit, overageFeeMdl: null, plan: user.plan };
  }
  return { ok: true };
}

// Единый текст ошибки о достигнутом лимите (429).
export function limitReachedMessage(
  feature: LimitedFeature,
  used: number,
  limit: number,
): string {
  return `Ați atins limita de ${limit} ${FEATURE_LABEL_RO[feature]} pentru perioada curentă. Utilizate: ${used}/${limit}.`;
}

export function featureUnavailableMessage(feature: LimitedFeature): string {
  return `Funcția „${FEATURE_LABEL_RO[feature]}” nu este disponibilă pe planul curent. Faceți upgrade la Pro.`;
}

// Сообщение о лимите без доплаты (жёсткий блок — Creator Hub/999, OBIECTE_ACTIVE).
// На HUB (участник и владелец с местом) «treceți la Pro» не предлагаем: у Pro лимит меньше.
export function limitReachedNoOverageMessage(
  feature: LimitedFeature,
  limit: number,
  plan?: SubscriptionPlan | null,
): string {
  const next = plan === "HUB" ? "așteptați perioada următoare." : "așteptați perioada următoare sau treceți la Pro.";
  return `Ați atins limita de ${limit} ${FEATURE_LABEL_RO[feature]} pentru perioada curentă. Doplata pentru această funcție nu este disponibilă — ${next}`;
}

// UsageResult(ok:false) → HTTP-ответ:
//   • reason "unavailable" (фича не на плане) → 403;
//   • reason "limit" + overageFeeMdl != null (доступна доплата sobre-limit) → 402 Payment
//     Required с { overage: { feeMdl, feature } } — UI предложит доплатить (действие НЕ
//     выполнено, пока оплата не подтверждена callback'ом);
//   • reason "limit" без доплаты → 429 (жёсткий блок).
export function usageBlockResponse(
  result: Extract<UsageResult, { ok: false }>,
  feature: LimitedFeature,
): NextResponse {
  if (result.reason === "unavailable") {
    return NextResponse.json(
      { error: featureUnavailableMessage(feature), usage: { used: result.used, limit: result.limit } },
      { status: 403 },
    );
  }
  if (result.overageFeeMdl != null) {
    return NextResponse.json(
      {
        error: limitReachedMessage(feature, result.used, result.limit),
        usage: { used: result.used, limit: result.limit },
        overage: { feeMdl: result.overageFeeMdl, feature },
      },
      { status: 402 },
    );
  }
  return NextResponse.json(
    {
      error: limitReachedNoOverageMessage(feature, result.limit, result.plan),
      usage: { used: result.used, limit: result.limit },
    },
    { status: 429 },
  );
}
