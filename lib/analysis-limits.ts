import type { SubscriptionPlan } from "@prisma/client";

// Лимиты анализов документов в месяц по плану.
export const ANALYSIS_LIMITS: Record<SubscriptionPlan, number> = {
  BASIC: 30,
  PRO: 100,
};

export function analysisLimit(plan: SubscriptionPlan | null): number {
  return plan ? ANALYSIS_LIMITS[plan] : 0;
}

// resetAt в прошлом (календарном) месяце относительно now?
export function isPastMonth(resetAt: Date, now: Date): boolean {
  return (
    resetAt.getFullYear() < now.getFullYear() ||
    (resetAt.getFullYear() === now.getFullYear() &&
      resetAt.getMonth() < now.getMonth())
  );
}

// Текущее использование с учётом месячного сброса (для отображения, без записи).
export function effectiveUsed(
  user: { analysisCount: number; analysisCountResetAt: Date },
  now: Date,
): number {
  return isPastMonth(user.analysisCountResetAt, now) ? 0 : user.analysisCount;
}
