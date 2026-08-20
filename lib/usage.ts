import { NextResponse } from "next/server";
import type { UsageFeature } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  planFeatureLimit,
  currentPeriod,
  FEATURE_LABEL_RO,
  type LimitedFeature,
} from "@/lib/plan-limits";

export type UsageResult =
  | { ok: true }
  | { ok: false; reason: "unavailable" | "limit"; used: number; limit: number };

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
  if (!user) return { ok: false, reason: "unavailable", used: 0, limit: 0 };
  if (user.role === "ADMIN") return { ok: true };

  const limit = planFeatureLimit(user.plan, feature as LimitedFeature);
  if (limit === 0) return { ok: false, reason: "unavailable", used: 0, limit: 0 };
  if (!Number.isFinite(limit)) return { ok: true }; // безлимит — не считаем

  const now = new Date();
  const anchor = user.planActivatedAt ?? user.createdAt;
  const { start, end } = currentPeriod(anchor, now);

  const existing = await prisma.usageCounter.findUnique({
    where: { userId_feature: { userId, feature } },
  });
  const samePeriod = !!existing && existing.periodStart.getTime() === start.getTime();
  const used = samePeriod ? existing!.count : 0;
  if (used >= limit) return { ok: false, reason: "limit", used, limit };

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

// OBIECTE_ACTIVE — живой подсчёт активных (неархивированных) досье, а НЕ накопительный
// счётчик. Лимит = сколько досье со статусом != ARCHIVE может существовать одновременно.
// Проверяется при создании нового досье; архивация освобождает слот. Инкремента нет.
export async function checkActiveObjects(userId: string): Promise<UsageResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, role: true },
  });
  if (!user) return { ok: false, reason: "unavailable", used: 0, limit: 0 };
  if (user.role === "ADMIN") return { ok: true };
  const limit = planFeatureLimit(user.plan, "OBIECTE_ACTIVE");
  if (limit === 0) return { ok: false, reason: "unavailable", used: 0, limit: 0 };
  if (!Number.isFinite(limit)) return { ok: true }; // безлимит (Pro)
  const count = await prisma.transaction.count({
    where: { userId, status: { not: "ARCHIVE" } },
  });
  if (count >= limit) return { ok: false, reason: "limit", used: count, limit };
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

// UsageResult(ok:false) → HTTP-ответ. 403 если фича недоступна на плане, иначе 429 (лимит).
// Точка расширения для доплаты sobre-limit (Этап B) — пока просто блокируем.
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
  return NextResponse.json(
    {
      error: limitReachedMessage(feature, result.used, result.limit),
      usage: { used: result.used, limit: result.limit },
    },
    { status: 429 },
  );
}
