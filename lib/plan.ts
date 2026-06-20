import type { SubscriptionPlan } from "@prisma/client";

// Подписка активна, если план активирован и не истёк.
// Новый пользователь регистрируется с planActivatedAt = null → подписка неактивна,
// пока он не выберет план на /subscribe или не активирует PRO кодом приглашения.
export function isPlanActive(user: {
  planActivatedAt: Date | null;
  planExpiresAt: Date | null;
}): boolean {
  if (!user.planActivatedAt) return false;
  if (user.planExpiresAt && user.planExpiresAt.getTime() <= Date.now()) {
    return false;
  }
  return true;
}

export const PLANS: readonly SubscriptionPlan[] = ["BASIC", "PRO"];

export function isValidPlan(value: unknown): value is SubscriptionPlan {
  return value === "BASIC" || value === "PRO";
}
