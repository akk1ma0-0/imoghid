// Правила управления подпиской CyberSource для клиента — чистые функции (без БД/сети), под тесты.
// Состояние в БД: status (ACTIVE / PAST_DUE / CANCELED / EXPIRED) + флаг cancelAtPeriodEnd.
// Клиенту отдаём только безопасное представление: без токенов, billingHold и внутренних полей.
import { canCancelDowngrade, canDowngrade, canUpgrade } from "@/lib/plan-change-rules";

export type SubForRules = {
  status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
  nextChargeAt: Date | null;
  graceEndsAt: Date | null;
  billingHold: string | null;
  plan: string;
  amount: string | null;
  currency: string | null;
  // Запланированная смена плана (Pro → Basic со следующего периода), см. plan-change-rules.ts.
  pendingPlan?: string | null;
  pendingAmount?: string | null;
  pendingFrom?: Date | null;
};

export type CardForRules = {
  status: "ACTIVE" | "REMOVED";
  cardBrand: string | null;
  cardLast4: string | null;
  expMonth: number | null;
  expYear: number | null;
  createdAt: Date;
} | null;

export type ClientStatus = "ACTIVE" | "PAST_DUE" | "CANCELED";

// Отменённая клиентом подписка (отмена в конце периода или статус CANCELED).
export const isCanceled = (s: SubForRules) => s.cancelAtPeriodEnd || s.status === "CANCELED";

export function clientStatus(s: SubForRules): ClientStatus | null {
  if (s.status === "EXPIRED") return null;
  if (isCanceled(s)) return "CANCELED";
  return s.status === "PAST_DUE" ? "PAST_DUE" : "ACTIVE";
}

// Отмена: только ACTIVE / PAST_DUE, ещё не отменённая.
export function canCancel(s: SubForRules): boolean {
  return (s.status === "ACTIVE" || s.status === "PAST_DUE") && !isCanceled(s);
}

export type ResumeCheck = { ok: true } | { ok: false; reason: "NOT_CANCELED" | "ENDED" | "NO_CARD" };

// Возобновление: отменённая, оплаченный период ещё идёт, токен карты на месте.
export function canResume(s: SubForRules, card: CardForRules, now: Date): ResumeCheck {
  if (s.status === "EXPIRED" || now.getTime() >= s.currentPeriodEnd.getTime()) return { ok: false, reason: "ENDED" };
  if (!isCanceled(s)) return { ok: false, reason: "NOT_CANCELED" };
  if (!card || card.status !== "ACTIVE") return { ok: false, reason: "NO_CARD" };
  return { ok: true };
}

// Смену карты разрешаем, пока подписка не закончилась.
export const canChangeCard = (s: SubForRules) => s.status !== "EXPIRED";

export type PayNowCheck = { ok: true } | { ok: false; reason: "NOT_PAST_DUE" | "CANCELED" | "NO_CARD" | "HOLD" };

// «Plătește acum»: только просрочка, активная карта, не отменена и без удержания админом.
export function canPayNow(s: SubForRules, card: CardForRules): PayNowCheck {
  if (s.status !== "PAST_DUE") return { ok: false, reason: "NOT_PAST_DUE" };
  if (isCanceled(s)) return { ok: false, reason: "CANCELED" };
  if (!card || card.status !== "ACTIVE") return { ok: false, reason: "NO_CARD" };
  if (s.billingHold) return { ok: false, reason: "HOLD" };
  return { ok: true };
}

// Кнопку «Plătește acum» показываем после смены карты: карта новее последней неудачной попытки.
export function cardChangedSince(card: CardForRules, lastFailureAt: Date | null): boolean {
  return !!card && card.status === "ACTIVE" && !!lastFailureAt && card.createdAt.getTime() > lastFailureAt.getTime();
}

export type ClientSubscriptionView = {
  plan: string;
  amount: string | null;
  currency: string | null;
  status: ClientStatus;
  cancelAtPeriodEnd: boolean;
  paidUntil: string; // конец оплаченного периода
  nextChargeAt: string | null; // null — отменена или просрочка без запланированного повтора
  accessUntil: string; // до какой даты сохраняется доступ (при просрочке — конец грейса)
  card: { brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null } | null;
  canCancel: boolean;
  canResume: boolean;
  canChangeCard: boolean;
  canPayNow: boolean;
  // Смена плана. upgradeTo/downgradeTo — null, если сейчас недоступна.
  upgradeTo: { plan: string; amount: string } | null;
  downgradeTo: { plan: string; amount: string } | null;
  pendingChange: { plan: string; amount: string | null; from: string } | null; // «După DD.MM.YYYY: Basic»
  canCancelPendingChange: boolean;
};

// Контекст смены плана: идёт ли автосписание с неясным исходом и цены каталога ("500.00").
export type PlanChangeViewCtx = { chargeInFlight: boolean; prices: { BASIC: string; PRO: string } };

export function toClientView(
  s: SubForRules,
  card: CardForRules,
  now: Date,
  lastFailureAt: Date | null,
  pc: PlanChangeViewCtx | null = null,
): ClientSubscriptionView | null {
  const status = clientStatus(s);
  if (!status) return null;
  const activeCard = card && card.status === "ACTIVE" ? card : null;
  const payNow = canPayNow(s, card);
  const ctx = { now, chargeInFlight: pc?.chargeInFlight ?? false };
  return {
    plan: s.plan,
    amount: s.amount,
    currency: s.currency,
    status,
    cancelAtPeriodEnd: isCanceled(s),
    paidUntil: s.currentPeriodEnd.toISOString(),
    nextChargeAt: status === "CANCELED" ? null : s.nextChargeAt?.toISOString() ?? null,
    accessUntil: (s.status === "PAST_DUE" && s.graceEndsAt ? s.graceEndsAt : s.currentPeriodEnd).toISOString(),
    card: activeCard
      ? { brand: activeCard.cardBrand, last4: activeCard.cardLast4, expMonth: activeCard.expMonth, expYear: activeCard.expYear }
      : null,
    canCancel: canCancel(s),
    canResume: canResume(s, card, now).ok,
    canChangeCard: canChangeCard(s),
    canPayNow: payNow.ok && cardChangedSince(card, lastFailureAt),
    upgradeTo: pc && canUpgrade(s, ctx).ok ? { plan: "PRO", amount: pc.prices.PRO } : null,
    downgradeTo: pc && canDowngrade(s, ctx).ok ? { plan: "BASIC", amount: pc.prices.BASIC } : null,
    pendingChange:
      s.pendingPlan && s.pendingFrom ? { plan: s.pendingPlan, amount: s.pendingAmount ?? null, from: s.pendingFrom.toISOString() } : null,
    canCancelPendingChange: canCancelDowngrade(s, ctx).ok,
  };
}

// ── Допуск к странице смены карты (/app/subscription/card) ──
// Раньше условие было внутри страницы и молча уводило в профиль, если у подписки не заполнена
// сумма (подписки, созданные до шага 6). Теперь сумму даёт согласие клиента (см.
// subscription-service), а отказ всегда объясняется.
export type CardChangeAccess =
  | { ok: true; amount: string; currency: string }
  | { ok: false; reason: "NO_SUBSCRIPTION" | "NO_AMOUNT" };

export function cardChangeAccess(view: Pick<ClientSubscriptionView, "canChangeCard" | "amount" | "currency"> | null): CardChangeAccess {
  if (!view || !view.canChangeCard) return { ok: false, reason: "NO_SUBSCRIPTION" };
  if (!view.amount || !view.currency) return { ok: false, reason: "NO_AMOUNT" };
  return { ok: true, amount: view.amount, currency: view.currency };
}

export const CARD_CHANGE_DENIED_TEXT: Record<"NO_SUBSCRIPTION" | "NO_AMOUNT", string> = {
  NO_SUBSCRIPTION: "Cardul poate fi schimbat doar pentru un abonament cu reînnoire automată activ.",
  NO_AMOUNT: "Cardul nu poate fi schimbat acum. Contactați-ne la info@biseeth.md și vom rezolva rapid.",
};

export function cardChangeDeniedText(reason: string | null | undefined): string | null {
  return reason === "NO_SUBSCRIPTION" || reason === "NO_AMOUNT" ? CARD_CHANGE_DENIED_TEXT[reason] : null;
}

// Простой кулдаун (как в resend-verification): повторное действие раньше срока → 429.
export function cooldownLeftMs(lastAt: Date | null, cooldownMs: number, now: Date): number {
  if (!lastAt) return 0;
  return Math.max(0, cooldownMs - (now.getTime() - lastAt.getTime()));
}
