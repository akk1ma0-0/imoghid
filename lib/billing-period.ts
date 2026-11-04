// Период подписки с автопродлением (CyberSource) и расписание списаний. Чистые функции — под тесты.
//
// Период — календарный месяц от якоря (дата и время первой оплаты, UTC). Число дня берётся из
// якоря; в коротком месяце — последний день, но якорь не «съезжает»: 31 янв → 28/29 фев → 31 мар.
// Поток VictoriaBank этот модуль не использует (там по-прежнему 30 дней).

const DAY_MS = 24 * 60 * 60 * 1000;

const daysInMonthUTC = (year: number, month0: number) => new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();

// anchor + n календарных месяцев (время суток — как у якоря).
export function addMonthsAnchored(anchor: Date, months: number): Date {
  const total = anchor.getUTCMonth() + months;
  const year = anchor.getUTCFullYear() + Math.floor(total / 12);
  const month0 = ((total % 12) + 12) % 12;
  const day = Math.min(anchor.getUTCDate(), daysInMonthUTC(year, month0));
  return new Date(
    Date.UTC(year, month0, day, anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()),
  );
}

// Конец следующего периода: первая дата «якорь + k месяцев» строго позже текущего конца.
// Для подписок, у которых конец уже стоит на якоре, это ровно +1 месяц от якоря; для старых
// (30-дневных) — ближайшая якорная дата после текущего конца, без накопления сдвига.
export function nextPeriodEnd(anchor: Date, currentEnd: Date): Date {
  let k = (currentEnd.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (currentEnd.getUTCMonth() - anchor.getUTCMonth());
  let candidate = addMonthsAnchored(anchor, Math.max(k, 1));
  for (let guard = 0; candidate.getTime() <= currentEnd.getTime() && guard < 24; guard++) {
    k = Math.max(k, 1) + 1;
    candidate = addMonthsAnchored(anchor, k);
  }
  return candidate;
}

// Списание — за сутки до конца периода: ежедневный cron (03:00 UTC) успевает продлить доступ
// до того, как план истечёт (иначе между концом периода и запуском cron доступ пропадал бы).
export const CHARGE_LEAD_MS = DAY_MS;
export const chargeDueFor = (periodEnd: Date) => new Date(periodEnd.getTime() - CHARGE_LEAD_MS);

// Мягкий отказ: попытки в срок, затем +1, +3, +5 дней от первого срока (attemptNo 1..4).
export const RETRY_OFFSETS_DAYS = [0, 1, 3, 5] as const;
export const MAX_ATTEMPTS = RETRY_OFFSETS_DAYS.length;

// Когда делать попытку attemptNo (1-based) за период с этим концом; null — попытки исчерпаны.
export function attemptDueAt(periodEnd: Date, attemptNo: number): Date | null {
  if (!Number.isInteger(attemptNo) || attemptNo < 1 || attemptNo > MAX_ATTEMPTS) return null;
  return new Date(chargeDueFor(periodEnd).getTime() + RETRY_OFFSETS_DAYS[attemptNo - 1] * DAY_MS);
}

// Доступ во время повторов / после жёсткого отказа — до 5 дней после конца оплаченного периода.
export const GRACE_DAYS = 5;
export const graceEndsFor = (periodEnd: Date) => new Date(periodEnd.getTime() + GRACE_DAYS * DAY_MS);

// Письмо «через 3 дня спишем X MDL» — один раз на период.
export const REMINDER_LEAD_MS = 3 * DAY_MS;

export type SubscriptionView = {
  kind: "PERSONAL" | "AGENCY";
  status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
  nextChargeAt: Date | null;
  graceEndsAt: Date | null;
  billingHold: string | null;
  reminderSentFor: Date | null;
};

export type SubscriptionAction =
  | "none"
  | "expire_canceled" // клиент отменил: оплаченный период закончился → EXPIRED
  | "expire_grace" // жёсткий отказ / повторы исчерпаны: грейс закончился → EXPIRED
  | "hold" // списание остановлено до решения админа
  | "charge"
  | "remind";

// Что делать с подпиской сейчас — одинаково для личных и агентских (kind AGENCY) подписок.
// Порядок важен: отмена и конец грейса — раньше списания.
export function decideSubscriptionAction(s: SubscriptionView, now: Date): SubscriptionAction {
  const t = now.getTime();
  // Отменённая клиентом (CANCELED или ACTIVE с cancelAtPeriodEnd): списаний нет; в конце
  // оплаченного периода → EXPIRED (план сбрасывается, токен удаляется).
  if (s.status === "CANCELED") {
    return s.cancelAtPeriodEnd && t >= s.currentPeriodEnd.getTime() ? "expire_canceled" : "none";
  }
  if (s.status !== "ACTIVE" && s.status !== "PAST_DUE") return "none";
  if (s.cancelAtPeriodEnd) return t >= s.currentPeriodEnd.getTime() ? "expire_canceled" : "none";
  if (s.status === "PAST_DUE" && s.nextChargeAt === null && s.graceEndsAt && t >= s.graceEndsAt.getTime()) {
    return "expire_grace";
  }
  if (s.billingHold) return "hold";
  if (s.nextChargeAt && t >= s.nextChargeAt.getTime()) return "charge";
  if (
    s.status === "ACTIVE" &&
    s.nextChargeAt &&
    t >= s.nextChargeAt.getTime() - REMINDER_LEAD_MS &&
    s.reminderSentFor?.getTime() !== s.currentPeriodEnd.getTime()
  ) {
    return "remind";
  }
  return "none";
}
