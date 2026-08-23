import { NextResponse } from "next/server";
import type { UsageFeature } from "@prisma/client";

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
  plan: "BASIC" | "PRO" | null;
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
    return { ok: false, reason: "limit", used: count, limit, overageFeeMdl: null };
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
export function limitReachedNoOverageMessage(feature: LimitedFeature, limit: number): string {
  return `Ați atins limita de ${limit} ${FEATURE_LABEL_RO[feature]} pentru perioada curentă. Doplata pentru această funcție nu este disponibilă — așteptați perioada următoare sau treceți la Pro.`;
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
      error: limitReachedNoOverageMessage(feature, result.limit),
      usage: { used: result.used, limit: result.limit },
    },
    { status: 429 },
  );
}
