// Агентская подписка CyberSource (kind AGENCY) для владельца агентства (БД). Правила —
// lib/agency-subscription-rules.ts. Агентства VictoriaBank (без строки Subscription) сюда не попадают.
//   • докупка мест — проверка перед Unified Checkout (checkAgencyTopup); выдача — в cit.ts;
//   • уменьшение со следующего периода (pendingSeats) + новое согласие на меньшую сумму;
//   • отмена / возобновление — как у личной подписки (доступ до конца оплаченного периода).
import { prisma } from "@/lib/prisma";
import { chargeDueFor } from "@/lib/billing-period";
import { paymentCurrency } from "@/lib/payments";
import { activeInviteCodeFilter } from "@/lib/agency";
import { sendAgencySeatsReductionEmail } from "@/lib/email";
import { AGENCY_SEATS_CONSENT_VERSION } from "@/lib/recurring-consent";
import { chargeInFlight } from "@/lib/subscription-service";
import {
  CANCEL_REDUCTION_DENIED_TEXT,
  canCancelReduction,
  canReduce,
  canTopup,
  effectiveSeats,
  prorateTopup,
  REDUCE_DENIED_TEXT,
  seatsAmount,
  TOPUP_DENIED_TEXT,
  toAgencyView,
  type AgencySub,
  type AgencySubscriptionView,
} from "@/lib/agency-subscription-rules";

const NO_SUB = "Agenția nu are un abonament cu reînnoire automată.";

function log(action: string, subscriptionId: string | null, result: string) {
  console.info(JSON.stringify({ evt: "cs_agency_subscription", action, subscriptionId, result }));
}

const include = {
  paymentMethod: true,
  agency: { select: { id: true, ownerId: true, seatsPaid: true, pricePerSeatMdl: true } },
} as const;

// Текущая агентская подписка владельца: ACTIVE / PAST_DUE или отменённая с идущим периодом.
export async function findOwnAgencySubscription(userId: string, now: Date = new Date()) {
  return prisma.subscription.findFirst({
    where: {
      userId,
      provider: "CYBERSOURCE",
      kind: "AGENCY",
      agencyId: { not: null },
      OR: [
        { status: { in: ["ACTIVE", "PAST_DUE"] } },
        { status: "CANCELED", cancelAtPeriodEnd: true, currentPeriodEnd: { gt: now } },
      ],
    },
    orderBy: { createdAt: "desc" },
    include,
  });
}

type OwnAgencySub = NonNullable<Awaited<ReturnType<typeof findOwnAgencySubscription>>>;

export async function hasOwnAgencyCsSubscription(userId: string, now: Date = new Date()): Promise<boolean> {
  return !!(await findOwnAgencySubscription(userId, now));
}

// Места подписки: поле seats, у старых подписок — места первой оплаты, затем seatsPaid агентства.
async function rulesSub(sub: OwnAgencySub): Promise<AgencySub> {
  let seats = effectiveSeats(sub.seats, null);
  if (!seats) {
    const first = await prisma.payment.findFirst({
      where: { subscriptionId: sub.id, purpose: "AGENCY_SEATS", initiator: "CUSTOMER", status: "PAID" },
      orderBy: { createdAt: "asc" },
      select: { seats: true },
    });
    seats = effectiveSeats(first?.seats, sub.agency?.seatsPaid) ?? 0;
  }
  return { ...sub, seats };
}

// Занятые места + зарезервированные активными кодами-приглашениями.
export async function usedSeats(agencyId: string): Promise<number> {
  const [occupied, reserved] = await Promise.all([
    prisma.agencyMembership.count({ where: { agencyId } }),
    prisma.inviteCode.count({ where: { agencyId, ...activeInviteCodeFilter() } }),
  ]);
  return occupied + reserved;
}

async function lastFailureAt(subscriptionId: string): Promise<Date | null> {
  const p = await prisma.payment.findFirst({
    where: { subscriptionId, initiator: "MERCHANT", status: "FAILED" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return p?.createdAt ?? null;
}

export async function getAgencySubscriptionView(userId: string, now: Date = new Date()): Promise<AgencySubscriptionView | null> {
  const sub = await findOwnAgencySubscription(userId, now);
  if (!sub || !sub.agency) return null;
  const s = await rulesSub(sub);
  return toAgencyView(
    { ...s, graceEndsAt: sub.graceEndsAt, currency: sub.currency ?? paymentCurrency() },
    sub.paymentMethod,
    sub.agency.pricePerSeatMdl,
    await usedSeats(sub.agency.id),
    { now, chargeInFlight: await chargeInFlight(sub.id), lastFailureAt: await lastFailureAt(sub.id) },
  );
}

export type AgencyActionResult =
  | { ok: true; changed: boolean; subscription: AgencySubscriptionView | null }
  | { ok: false; status: number; message: string };

// ── Докупка мест: проверка перед Unified Checkout (страница оплаты и capture context) ──
export type TopupCheck =
  | {
      ok: true;
      subscriptionId: string;
      seatsToAdd: number;
      newSeats: number;
      amountNow: string; // пропорция остатка периода (мин. 10 MDL)
      monthlyAmount: string; // со следующего периода
      paidUntil: Date;
    }
  | { ok: false; status: number; message: string };

export async function checkAgencyTopup(userId: string, seatsToAdd: number, now: Date = new Date()): Promise<TopupCheck> {
  const sub = await findOwnAgencySubscription(userId, now);
  if (!sub || !sub.agency) return { ok: false, status: 404, message: NO_SUB };
  const s = await rulesSub(sub);
  const check = canTopup(s, seatsToAdd, { now, chargeInFlight: await chargeInFlight(sub.id) });
  if (!check.ok) return { ok: false, status: check.reason === "INVALID_SEATS" ? 400 : 409, message: TOPUP_DENIED_TEXT[check.reason] };
  const price = sub.agency.pricePerSeatMdl;
  return {
    ok: true,
    subscriptionId: sub.id,
    seatsToAdd,
    newSeats: s.seats + seatsToAdd,
    amountNow: prorateTopup({ seatsToAdd, pricePerSeatMdl: price, periodStart: sub.currentPeriodStart, periodEnd: sub.currentPeriodEnd, now }),
    monthlyAmount: seatsAmount(s.seats + seatsToAdd, price),
    paidUntil: sub.currentPeriodEnd,
  };
}

type ConsentMeta = { ip: string | null; userAgent: string | null };

// ── Уменьшение мест со следующего периода ──
// Сериализуется с выдачей кодов-приглашений блокировкой строки агентства (FOR UPDATE): между
// проверкой «занято + коды» и записью pendingSeats новый код не появится.
export async function scheduleSeatReduction(
  userId: string,
  newSeats: number,
  meta: ConsentMeta,
  now: Date = new Date(),
): Promise<AgencyActionResult> {
  const sub = await findOwnAgencySubscription(userId, now);
  if (!sub || !sub.agency) return { ok: false, status: 404, message: NO_SUB };
  const s = await rulesSub(sub);
  const inFlight = await chargeInFlight(sub.id);
  const agencyId = sub.agency.id;
  const price = sub.agency.pricePerSeatMdl;
  const amount = seatsAmount(newSeats, price);
  const currency = sub.currency ?? paymentCurrency();

  const res = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "agencies" WHERE id = ${agencyId} FOR UPDATE`;
    const [occupied, reserved] = await Promise.all([
      tx.agencyMembership.count({ where: { agencyId } }),
      tx.inviteCode.count({ where: { agencyId, ...activeInviteCodeFilter() } }),
    ]);
    const check = canReduce(s, newSeats, occupied + reserved, { now, chargeInFlight: inFlight });
    if (!check.ok) return { ok: false as const, reason: check.reason };
    if (s.pendingSeats === newSeats) return { ok: true as const, changed: false };
    const upd = await tx.subscription.updateMany({
      where: {
        id: sub.id,
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
        billingHold: null,
        currentPeriodEnd: sub.currentPeriodEnd,
      },
      data: { pendingSeats: newSeats, pendingAmount: amount, pendingFrom: sub.currentPeriodEnd, pendingSetAt: now },
    });
    if (upd.count === 0) return { ok: false as const, reason: "RENEWAL_IN_PROGRESS" as const };
    await tx.recurringConsent.create({
      data: { userId, subscriptionId: sub.id, textVersion: AGENCY_SEATS_CONSENT_VERSION, amount, currency, acceptedAt: now, ip: meta.ip, userAgent: meta.userAgent },
    });
    return { ok: true as const, changed: true };
  });
  if (!res.ok) {
    log("reduce", sub.id, `refused_${res.reason}`);
    return { ok: false, status: res.reason === "INVALID_SEATS" ? 400 : 409, message: REDUCE_DENIED_TEXT[res.reason] };
  }
  log("reduce", sub.id, res.changed ? `scheduled_${newSeats}` : "already_scheduled");
  if (res.changed) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (user) {
      try {
        await sendAgencySeatsReductionEmail(user.email, { name: user.name, fromSeats: s.seats, toSeats: newSeats, amount, currency, effectiveAt: sub.currentPeriodEnd });
      } catch (e) {
        console.warn(JSON.stringify({ evt: "cs_agency_subscription", subscriptionId: sub.id, warn: "email_failed", message: e instanceof Error ? e.message : String(e) }));
      }
    }
  }
  return { ok: true, changed: res.changed, subscription: await getAgencySubscriptionView(userId, now) };
}

// Отмена запланированного уменьшения: со следующего периода — прежнее число мест; новое согласие на
// эту сумму (последнее согласие было на меньшую — иначе биллинг остановил бы списание).
export async function cancelSeatReduction(userId: string, meta: ConsentMeta, now: Date = new Date()): Promise<AgencyActionResult> {
  const sub = await findOwnAgencySubscription(userId, now);
  if (!sub || !sub.agency) return { ok: false, status: 404, message: NO_SUB };
  const s = await rulesSub(sub);
  const check = canCancelReduction(s, { now, chargeInFlight: await chargeInFlight(sub.id) });
  if (!check.ok) {
    if (check.reason === "NOT_SCHEDULED") return { ok: true, changed: false, subscription: await getAgencySubscriptionView(userId, now) };
    log("cancel_reduce", sub.id, `refused_${check.reason}`);
    return { ok: false, status: 409, message: CANCEL_REDUCTION_DENIED_TEXT[check.reason] };
  }
  const amount = seatsAmount(s.seats, sub.agency.pricePerSeatMdl);
  const currency = sub.currency ?? paymentCurrency();
  const changed = await prisma.$transaction(async (tx) => {
    const upd = await tx.subscription.updateMany({
      where: { id: sub.id, pendingSeats: { not: null }, pendingFrom: { gt: now }, currentPeriodEnd: sub.currentPeriodEnd },
      data: { pendingSeats: null, pendingAmount: null, pendingFrom: null, pendingSetAt: null },
    });
    if (upd.count === 0) return false;
    await tx.recurringConsent.create({
      data: { userId, subscriptionId: sub.id, textVersion: AGENCY_SEATS_CONSENT_VERSION, amount, currency, acceptedAt: now, ip: meta.ip, userAgent: meta.userAgent },
    });
    return true;
  });
  log("cancel_reduce", sub.id, changed ? "canceled" : "not_scheduled");
  return { ok: true, changed, subscription: await getAgencySubscriptionView(userId, now) };
}

// ── Отмена / возобновление ──
export async function cancelAgencySubscription(userId: string, now: Date = new Date()): Promise<AgencyActionResult> {
  const sub = await findOwnAgencySubscription(userId, now);
  if (!sub) return { ok: false, status: 404, message: NO_SUB };
  const upd = await prisma.subscription.updateMany({
    where: { id: sub.id, cancelAtPeriodEnd: false, status: { in: ["ACTIVE", "PAST_DUE"] } },
    // Запланированное уменьшение не снимаем: последнее согласие — на эту сумму, и при возобновлении
    // оно продолжит действовать. При окончании подписки (EXPIRED) его очищает биллинг.
    data: { cancelAtPeriodEnd: true, canceledAt: now },
  });
  log("cancel", sub.id, upd.count ? "canceled" : "already_canceled");
  return { ok: true, changed: upd.count > 0, subscription: await getAgencySubscriptionView(userId, now) };
}

const RESUME_TEXT = {
  ENDED: "Abonamentul agenției s-a încheiat și nu mai poate fi reluat. Cumpărați din nou locurile.",
  NO_CARD: "Cardul salvat nu mai este disponibil. Pentru a continua, cumpărați din nou locurile.",
  PRICE: "Abonamentul nu poate fi reluat automat. Contactați-ne la info@biseeth.md.",
} as const;

// Возобновление до конца оплаченного периода. Сумма следующего списания (места × цена) должна
// совпадать с последним согласием — иначе биллинг всё равно остановит списание.
export async function resumeAgencySubscription(userId: string, now: Date = new Date()): Promise<AgencyActionResult> {
  const sub = await findOwnAgencySubscription(userId, now);
  if (!sub || !sub.agency) return { ok: false, status: 409, message: RESUME_TEXT.ENDED };
  if (!sub.cancelAtPeriodEnd && sub.status !== "CANCELED") return { ok: true, changed: false, subscription: await getAgencySubscriptionView(userId, now) };
  if (now.getTime() >= sub.currentPeriodEnd.getTime()) return { ok: false, status: 409, message: RESUME_TEXT.ENDED };
  if (!sub.paymentMethod || sub.paymentMethod.status !== "ACTIVE") return { ok: false, status: 409, message: RESUME_TEXT.NO_CARD };
  const next = await agencyNextChargeAmount(sub);
  const consent = await prisma.recurringConsent.findFirst({ where: { subscriptionId: sub.id }, orderBy: { acceptedAt: "desc" }, select: { amount: true } });
  if (!consent || !next || Number(consent.amount) !== Number(next)) {
    log("resume", sub.id, "refused_consent_mismatch");
    return { ok: false, status: 409, message: RESUME_TEXT.PRICE };
  }
  const upd = await prisma.subscription.updateMany({
    where: { id: sub.id, cancelAtPeriodEnd: true, currentPeriodEnd: { gt: now }, status: { in: ["ACTIVE", "PAST_DUE", "CANCELED"] } },
    data: {
      cancelAtPeriodEnd: false,
      canceledAt: null,
      ...(sub.status === "CANCELED" ? { status: "ACTIVE" as const } : {}),
      ...(sub.nextChargeAt ? {} : { nextChargeAt: chargeDueFor(sub.currentPeriodEnd) }),
    },
  });
  log("resume", sub.id, upd.count ? "resumed" : "already_active");
  return { ok: true, changed: upd.count > 0, subscription: await getAgencySubscriptionView(userId, now) };
}

// Сумма следующего списания (места следующего периода × цена) — для согласия при смене карты.
export async function agencyNextChargeAmount(sub: OwnAgencySub): Promise<string | null> {
  if (!sub.agency) return null;
  const s = await rulesSub(sub);
  if (!s.seats) return null;
  const seats = s.pendingSeats != null && s.pendingFrom && s.pendingFrom.getTime() <= sub.currentPeriodEnd.getTime() ? s.pendingSeats : s.seats;
  return seatsAmount(seats, sub.agency.pricePerSeatMdl);
}
