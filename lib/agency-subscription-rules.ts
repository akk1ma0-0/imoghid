// Агентская подписка CyberSource (kind=AGENCY, plan HUB) — чистые правила (без БД/сети), под тесты.
//   Месячная сумма = места × цена места агентства (Agency.pricePerSeatMdl).
//   Докупка мест — сразу: оплата пропорционально остатку текущего периода (CIT, Unified Checkout),
//                  минимум 10 MDL; период не меняется, со следующего периода — (места + N) × цена.
//   Уменьшение — со следующего периода: pendingSeats/pendingAmount/pendingFrom, без возврата.
//   Отмена — без возврата, доступ до конца оплаченного периода (запланированное уменьшение сохраняется).
// Агентства VictoriaBank (без строки Subscription) сюда не попадают.
import { AGENCY_MIN_SEATS } from "@/lib/plan-limits";

export const TOPUP_MIN_MDL = 10;
// Верхняя граница числа мест в одной операции — защита от опечаток и переполнения сумм.
export const MAX_AGENCY_SEATS = 1000;

export type AgencySub = {
  status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  nextChargeAt: Date | null;
  billingHold: string | null;
  seats: number; // места текущего периода (уже с учётом legacy-подстановки)
  pendingSeats?: number | null;
  pendingAmount?: string | null;
  pendingFrom?: Date | null;
};

// chargeInFlight — по подписке есть автосписание PENDING/UNKNOWN (исход ещё не ясен).
export type AgencyCtx = { now: Date; chargeInFlight: boolean };

const canceled = (s: AgencySub) => s.cancelAtPeriodEnd || s.status === "CANCELED";
const ended = (s: AgencySub, now: Date) => s.status === "EXPIRED" || now.getTime() >= s.currentPeriodEnd.getTime();
const renewalStarted = (s: AgencySub, ctx: AgencyCtx) =>
  ctx.chargeInFlight || (!!s.nextChargeAt && ctx.now.getTime() >= s.nextChargeAt.getTime());

// "1350.00" — сумма за seats мест по цене места (целые MDL).
export function seatsAmount(seats: number, pricePerSeatMdl: number): string {
  return (seats * pricePerSeatMdl).toFixed(2);
}

// Места подписки: поле seats, у старых подписок (null) — места первой оплаты.
export function effectiveSeats(subSeats: number | null | undefined, firstPaymentSeats: number | null | undefined): number | null {
  if (Number.isInteger(subSeats) && (subSeats as number) > 0) return subSeats as number;
  if (Number.isInteger(firstPaymentSeats) && (firstPaymentSeats as number) > 0) return firstPaymentSeats as number;
  return null;
}

// Сумма докупки: N × цена × (оставшиеся дни / дни периода), до 0,01 MDL (half-up), минимум 10 MDL.
// Дни, а не миллисекунды: сумма на странице оплаты и в платеже совпадает в течение суток
// (начатый день считается целым). Считаем в банях через BigInt — без ошибок плавающей точки.
const DAY_MS = 24 * 60 * 60 * 1000;

export function topupDays(periodStart: Date, periodEnd: Date, now: Date): { left: number; total: number } {
  const total = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / DAY_MS));
  const left = Math.min(total, Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / DAY_MS)));
  return { left, total };
}

export function prorateTopup(args: {
  seatsToAdd: number;
  pricePerSeatMdl: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): string {
  const { left, total } = topupDays(args.periodStart, args.periodEnd, args.now);
  const fullBani = BigInt(args.seatsToAdd) * BigInt(args.pricePerSeatMdl) * 100n;
  const t = BigInt(total);
  let bani = (fullBani * BigInt(left) * 2n + t) / (2n * t); // округление half-up
  const minBani = BigInt(TOPUP_MIN_MDL * 100);
  if (bani < minBani) bani = minBani;
  const lei = bani / 100n;
  const rest = (bani % 100n).toString().padStart(2, "0");
  return `${lei}.${rest}`;
}

export type TopupReason =
  | "INVALID_SEATS"
  | "ENDED"
  | "CANCELED"
  | "PAST_DUE"
  | "HOLD"
  | "REDUCTION_SCHEDULED"
  | "RENEWAL_IN_PROGRESS";
export type TopupCheck = { ok: true } | { ok: false; reason: TopupReason };

// Докупка: только оплаченная активная подписка без отмены, удержания и запланированного уменьшения;
// не в момент продления (иначе места попали бы в оплату не того периода).
export function canTopup(s: AgencySub, seatsToAdd: number, ctx: AgencyCtx): TopupCheck {
  if (!Number.isInteger(seatsToAdd) || seatsToAdd < 1 || s.seats + seatsToAdd > MAX_AGENCY_SEATS) {
    return { ok: false, reason: "INVALID_SEATS" };
  }
  if (ended(s, ctx.now)) return { ok: false, reason: "ENDED" };
  if (canceled(s)) return { ok: false, reason: "CANCELED" };
  if (s.status === "PAST_DUE") return { ok: false, reason: "PAST_DUE" };
  if (s.billingHold) return { ok: false, reason: "HOLD" };
  if (s.pendingSeats != null) return { ok: false, reason: "REDUCTION_SCHEDULED" };
  if (renewalStarted(s, ctx)) return { ok: false, reason: "RENEWAL_IN_PROGRESS" };
  return { ok: true };
}

export type ReduceReason =
  | "INVALID_SEATS"
  | "NOT_LESS"
  | "BELOW_MIN"
  | "BELOW_USED"
  | "ENDED"
  | "CANCELED"
  | "PAST_DUE"
  | "HOLD"
  | "RENEWAL_IN_PROGRESS";
export type ReduceCheck = { ok: true } | { ok: false; reason: ReduceReason };

// Уменьшение со следующего периода. used — занятые места + зарезервированные активными кодами.
// Уже запланированное уменьшение можно заменить другим числом (до даты списания).
export function canReduce(s: AgencySub, newSeats: number, used: number, ctx: AgencyCtx): ReduceCheck {
  if (!Number.isInteger(newSeats) || newSeats < 1) return { ok: false, reason: "INVALID_SEATS" };
  if (ended(s, ctx.now)) return { ok: false, reason: "ENDED" };
  if (canceled(s)) return { ok: false, reason: "CANCELED" };
  if (s.status === "PAST_DUE") return { ok: false, reason: "PAST_DUE" };
  if (s.billingHold) return { ok: false, reason: "HOLD" };
  if (renewalStarted(s, ctx)) return { ok: false, reason: "RENEWAL_IN_PROGRESS" };
  if (newSeats >= s.seats) return { ok: false, reason: "NOT_LESS" };
  if (newSeats < AGENCY_MIN_SEATS) return { ok: false, reason: "BELOW_MIN" };
  if (newSeats < used) return { ok: false, reason: "BELOW_USED" };
  return { ok: true };
}

export type CancelReductionCheck = { ok: true } | { ok: false; reason: "NOT_SCHEDULED" | "RENEWAL_IN_PROGRESS" };

export function canCancelReduction(s: AgencySub, ctx: AgencyCtx): CancelReductionCheck {
  if (s.pendingSeats == null || !s.pendingFrom) return { ok: false, reason: "NOT_SCHEDULED" };
  if (ctx.now.getTime() >= s.pendingFrom.getTime() || renewalStarted(s, ctx)) return { ok: false, reason: "RENEWAL_IN_PROGRESS" };
  return { ok: true };
}

// Места для периода, начинающегося в periodStart: уменьшение действует с pendingFrom (включительно).
export function seatsForPeriod(s: AgencySub, periodStart: Date): { seats: number; changed: boolean } {
  if (s.pendingSeats != null && s.pendingFrom && periodStart.getTime() >= s.pendingFrom.getTime()) {
    return { seats: s.pendingSeats, changed: s.pendingSeats !== s.seats };
  }
  return { seats: s.seats, changed: false };
}

// Сумма списания за период и совпадает ли она с последним согласием клиента.
// Не совпадает (например, админ изменил цену места) → списание не делаем, удержание PRICE_CHANGED.
export function agencyChargeTerms(
  s: AgencySub,
  periodStart: Date,
  pricePerSeatMdl: number,
  consentAmount: string | null,
): { seats: number; amount: string; changed: boolean; consentOk: boolean } {
  const { seats, changed } = seatsForPeriod(s, periodStart);
  const amount = seatsAmount(seats, pricePerSeatMdl);
  return { seats, amount, changed, consentOk: !!consentAmount && Number(consentAmount) === Number(amount) };
}

// ── Представление для клиента (страница /app/agency) ──
export type AgencySubscriptionView = {
  status: "ACTIVE" | "PAST_DUE" | "CANCELED";
  seats: number;
  pricePerSeat: number;
  amount: string; // месячная сумма текущего периода
  currency: string;
  periodStart: string; // начало текущего оплаченного периода (для оценки суммы докупки)
  paidUntil: string;
  nextChargeAt: string | null;
  accessUntil: string;
  card: { brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null } | null;
  pendingReduction: { seats: number; amount: string | null; from: string } | null;
  canTopup: boolean;
  canReduce: boolean;
  minReduceTo: number; // нижняя граница для уменьшения (минимум мест или занятые)
  canCancelReduction: boolean;
  canCancel: boolean;
  canResume: boolean;
  canChangeCard: boolean;
  canPayNow: boolean;
};

export type AgencyCard = {
  status: "ACTIVE" | "REMOVED";
  cardBrand: string | null;
  cardLast4: string | null;
  expMonth: number | null;
  expYear: number | null;
  createdAt: Date;
} | null;

export function toAgencyView(
  s: AgencySub & { graceEndsAt: Date | null; currency: string | null },
  card: AgencyCard,
  pricePerSeatMdl: number,
  used: number,
  ctx: AgencyCtx & { lastFailureAt: Date | null },
): AgencySubscriptionView | null {
  if (s.status === "EXPIRED") return null;
  const isCanceled = canceled(s);
  const activeCard = card && card.status === "ACTIVE" ? card : null;
  const minReduceTo = Math.max(AGENCY_MIN_SEATS, used);
  const status = isCanceled ? "CANCELED" : s.status === "PAST_DUE" ? "PAST_DUE" : "ACTIVE";
  return {
    status,
    seats: s.seats,
    pricePerSeat: pricePerSeatMdl,
    amount: seatsAmount(s.seats, pricePerSeatMdl),
    currency: s.currency ?? "MDL",
    periodStart: s.currentPeriodStart.toISOString(),
    paidUntil: s.currentPeriodEnd.toISOString(),
    nextChargeAt: isCanceled ? null : s.nextChargeAt?.toISOString() ?? null,
    accessUntil: (s.status === "PAST_DUE" && s.graceEndsAt ? s.graceEndsAt : s.currentPeriodEnd).toISOString(),
    card: activeCard
      ? { brand: activeCard.cardBrand, last4: activeCard.cardLast4, expMonth: activeCard.expMonth, expYear: activeCard.expYear }
      : null,
    pendingReduction:
      s.pendingSeats != null && s.pendingFrom
        ? { seats: s.pendingSeats, amount: s.pendingAmount ?? null, from: s.pendingFrom.toISOString() }
        : null,
    canTopup: canTopup(s, 1, ctx).ok,
    canReduce: minReduceTo < s.seats && canReduce(s, s.seats - 1, used, ctx).ok,
    minReduceTo,
    canCancelReduction: canCancelReduction(s, ctx).ok,
    canCancel: (s.status === "ACTIVE" || s.status === "PAST_DUE") && !isCanceled,
    canResume: isCanceled && !ended(s, ctx.now) && !!activeCard,
    canChangeCard: true,
    canPayNow:
      s.status === "PAST_DUE" &&
      !isCanceled &&
      !s.billingHold &&
      !!activeCard &&
      !!ctx.lastFailureAt &&
      activeCard.createdAt.getTime() > ctx.lastFailureAt.getTime(),
  };
}

// ── Тексты для клиента (румынский, простым языком) ──
export const TOPUP_DENIED_TEXT: Record<TopupReason, string> = {
  INVALID_SEATS: "Indicați un număr corect de locuri.",
  ENDED: "Abonamentul agenției s-a încheiat. Cumpărați din nou locurile.",
  CANCELED: "Abonamentul este anulat. Reluați abonamentul, apoi puteți adăuga locuri.",
  PAST_DUE: "Mai întâi trebuie achitată plata lunară restantă.",
  HOLD: "Adăugarea locurilor nu este disponibilă acum. Contactați-ne la info@biseeth.md.",
  REDUCTION_SCHEDULED: "Ați programat reducerea locurilor. Anulați reducerea, apoi puteți adăuga locuri.",
  RENEWAL_IN_PROGRESS: "Reînnoirea abonamentului este în curs. Încercați din nou după ce se finalizează.",
};

export const REDUCE_DENIED_TEXT: Record<ReduceReason, string> = {
  INVALID_SEATS: "Indicați un număr corect de locuri.",
  NOT_LESS: "Numărul nou de locuri trebuie să fie mai mic decât cel actual.",
  BELOW_MIN: `Agenția trebuie să aibă cel puțin ${AGENCY_MIN_SEATS} locuri.`,
  BELOW_USED: "Locurile sunt ocupate de colegi sau rezervate prin coduri de invitație. Eliberați-le mai întâi.",
  ENDED: "Abonamentul agenției s-a încheiat.",
  CANCELED: "Abonamentul este anulat. Reluați abonamentul, apoi puteți schimba numărul de locuri.",
  PAST_DUE: "Mai întâi trebuie achitată plata lunară restantă.",
  HOLD: "Schimbarea numărului de locuri nu este disponibilă acum. Contactați-ne la info@biseeth.md.",
  RENEWAL_IN_PROGRESS: "Reînnoirea abonamentului este în curs. Încercați din nou după ce se finalizează.",
};

export const CANCEL_REDUCTION_DENIED_TEXT = {
  RENEWAL_IN_PROGRESS: "Reînnoirea cu numărul nou de locuri este deja în curs și nu mai poate fi oprită.",
} as const;
