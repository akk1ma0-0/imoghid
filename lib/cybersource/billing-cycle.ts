// Ежемесячное автосписание (MIT) по сохранённому токену и жизненный цикл подписки CyberSource.
//
// Запуск — из cron (check-expired-plans → runBillingCycle, при CS_BILLING_ENABLED=true) и из
// админ-эндпоинта для тестовой среды. На подписку за запуск — одно действие (decideSubscriptionAction):
//   remind          — письмо за 3 дня до списания (один раз на период);
//   charge          — списание суммы согласия за следующий период; сначала сверка незавершённой попытки;
//   expire_canceled — отменена клиентом, оплаченный период закончился → EXPIRED;
//   expire_grace    — жёсткий отказ / повторы исчерпаны, грейс закончился → EXPIRED.
// Идемпотентность: строка Payment (subscriptionId, periodStart, attemptNo) создаётся до вызова API
// (payments.ts → claimChargeAttempt); переходы подписки — условными updateMany (повторный/
// параллельный запуск не продлевает период дважды). Таймаут/5xx → Payment UNKNOWN, повторного
// списания нет, пока исход не прояснит сверка (search.ts).
// Агентские подписки (kind AGENCY): сумма = места периода × цена места агентства, сверяется с
// последним согласием (иначе удержание PRICE_CHANGED); продление двигает Agency.planExpiresAt
// (доступ участников), а не личный план владельца. См. ветки *Agency ниже.
import type { PaymentMethod, Subscription } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { PLAN_PRICING } from "@/lib/payments";
import { chargeSavedCard } from "@/lib/cybersource/payments";
import { findByReferenceCode } from "@/lib/cybersource/search";
import { retirePaymentMethod } from "@/lib/cybersource/token-retire";
import { termsForPeriod } from "@/lib/plan-change-rules";
import { agencyChargeTerms, effectiveSeats, type AgencySub } from "@/lib/agency-subscription-rules";
import { classifyDecline, type DeclineClass } from "@/lib/cybersource/declines";
import {
  attemptDueAt,
  chargeDueFor,
  decideSubscriptionAction,
  graceEndsFor,
  MAX_ATTEMPTS,
  nextPeriodEnd,
  REMINDER_LEAD_MS,
} from "@/lib/billing-period";
import {
  agencyReceiptInfo,
  sendAgencyBillingFailedEmail,
  sendAgencyBillingReminderEmail,
  sendAgencySeatsChangedAtRenewalEmail,
  sendAgencySubscriptionEndedEmail,
  sendBillingFailedEmail,
  sendBillingReminderEmail,
  sendPlanChangedAtRenewalEmail,
  sendReceiptEmail,
  sendSubscriptionEndedEmail,
} from "@/lib/email";

const IN_FLIGHT_MS = 15 * 60 * 1000; // PENDING-попытка моложе — её ещё обрабатывает другой запуск
const NOT_FOUND_GIVE_UP_MS = 60 * 60 * 1000; // UNKNOWN, которого нет в CyberSource через час, — не прошёл
const UPGRADE_WINDOW_MS = 60 * 60 * 1000; // клиент оплачивает переход Basic → Pro — старую подписку не списываем

type Sub = Subscription & {
  paymentMethod: PaymentMethod | null;
  user: { id: string; email: string; name: string; plan: string | null; planActivatedAt: Date | null };
  agency: { id: string; pricePerSeatMdl: number; seatsPaid: number } | null;
};

const SUB_INCLUDE = {
  paymentMethod: true,
  user: { select: { id: true, email: true, name: true, plan: true, planActivatedAt: true } },
  agency: { select: { id: true, pricePerSeatMdl: true, seatsPaid: true } },
} as const;

export type BillingResult = { subscriptionId: string; action: string; result: string };

function log(line: Record<string, unknown>, level: "info" | "warn" | "error" = "info") {
  const s = JSON.stringify({ evt: "cs_billing", ...line });
  if (level === "error") console.error(s);
  else if (level === "warn") console.warn(s);
  else console.info(s);
}

const cents = (v: string | number) => Math.round(Number(v) * 100);

export async function runBillingCycle(opts: { now?: Date; subscriptionId?: string; limit?: number } = {}): Promise<BillingResult[]> {
  const now = opts.now ?? new Date();
  const subs = (await prisma.subscription.findMany({
    where: opts.subscriptionId
      ? { id: opts.subscriptionId, provider: "CYBERSOURCE" }
      : {
          provider: "CYBERSOURCE",
          OR: [
            { status: { in: ["ACTIVE", "PAST_DUE"] }, nextChargeAt: { lte: new Date(now.getTime() + REMINDER_LEAD_MS) } },
            { status: { in: ["ACTIVE", "PAST_DUE", "CANCELED"] }, cancelAtPeriodEnd: true, currentPeriodEnd: { lte: now } },
            { status: "PAST_DUE", graceEndsAt: { lte: now } },
          ],
        },
    include: SUB_INCLUDE,
    orderBy: { nextChargeAt: "asc" },
    take: opts.limit ?? 25,
  })) as Sub[];

  const results: BillingResult[] = [];
  for (const sub of subs) {
    const action = decideSubscriptionAction(sub, now);
    try {
      const result = await processSubscription(sub, action, now);
      results.push({ subscriptionId: sub.id, action, result });
      log({ subscriptionId: sub.id, action, result });
    } catch (e) {
      results.push({ subscriptionId: sub.id, action, result: "error" });
      log({ subscriptionId: sub.id, action, result: "error", message: e instanceof Error ? e.message : String(e) }, "error");
    }
  }
  return results;
}

async function processSubscription(sub: Sub, action: string, now: Date): Promise<string> {
  switch (action) {
    case "none":
      return "none";
    case "hold":
      return `hold:${sub.billingHold}`;
    case "remind":
      return sub.kind === "AGENCY" ? remindAgency(sub) : remind(sub);
    case "expire_canceled":
      return expire(sub, "canceled", now);
    case "expire_grace":
      return expire(sub, "payment_failed", now);
    case "charge":
      return charge(sub, now);
    default:
      return "none";
  }
}

async function setHold(sub: Sub, hold: string, alert: string): Promise<string> {
  await prisma.subscription.update({ where: { id: sub.id }, data: { billingHold: hold } });
  log({ subscriptionId: sub.id, hold, alert }, "error");
  return `hold:${hold}`;
}

async function consentedAmount(sub: Sub): Promise<string | null> {
  if (sub.amount) return sub.amount;
  const c = await prisma.recurringConsent.findFirst({ where: { subscriptionId: sub.id }, orderBy: { acceptedAt: "desc" } });
  return c?.amount ?? null;
}

// План и сумма за период, начинающийся в periodStart. Запланированная смена (Pro → Basic) действует
// с pendingFrom: списываем сумму нового плана — она меньше, нового согласия не нужно (в письме и
// чеке — новая сумма). Без смены — сумма согласия, как раньше.
async function periodTerms(sub: Sub, periodStart: Date): Promise<{ plan: string; amount: string | null; changedFrom: string | null }> {
  const t = termsForPeriod(sub, periodStart);
  if (t.changed) return { plan: t.plan, amount: t.amount, changedFrom: sub.plan };
  return { plan: sub.plan, amount: await consentedAmount(sub), changedFrom: null };
}

async function remind(sub: Sub): Promise<string> {
  if (!sub.nextChargeAt) return "none";
  // Клейм письма на этот период — повторный запуск не отправит второе.
  const claim = await prisma.subscription.updateMany({
    where: { id: sub.id, OR: [{ reminderSentFor: null }, { NOT: { reminderSentFor: sub.currentPeriodEnd } }] },
    data: { reminderSentFor: sub.currentPeriodEnd },
  });
  if (claim.count === 0) return "reminder_already_sent";
  const terms = await periodTerms(sub, sub.currentPeriodEnd);
  try {
    await sendBillingReminderEmail(sub.user.email, {
      name: sub.user.name,
      plan: terms.plan,
      amount: terms.amount ?? "",
      currency: sub.currency ?? "MDL",
      chargeAt: sub.nextChargeAt,
      changedFrom: terms.changedFrom,
    });
  } catch (e) {
    log({ subscriptionId: sub.id, warn: "reminder_email_failed", message: e instanceof Error ? e.message : String(e) }, "warn");
  }
  return "reminder_sent";
}

async function charge(sub: Sub, now: Date): Promise<string> {
  const periodStart = sub.currentPeriodEnd; // оплачиваемый период начинается с конца текущего

  // 1) Незавершённая попытка за этот период — сначала прояснить её исход, без нового списания.
  const pending = await prisma.payment.findFirst({
    where: { subscriptionId: sub.id, initiator: "MERCHANT", periodStart, status: { in: ["PENDING", "UNKNOWN"] } },
    orderBy: { attemptNo: "desc" },
  });
  if (pending) return reconcileAttempt(sub, pending, now);

  // Клиент сейчас оплачивает переход Basic → Pro (новая подписка заменит эту) — не списываем,
  // иначе была бы двойная оплата. Брошенная оплата перестаёт мешать через час.
  const upgrading = await prisma.payment.findFirst({
    where: {
      replacesSubscriptionId: sub.id,
      initiator: "CUSTOMER",
      status: { in: ["PENDING", "UNKNOWN"] },
      createdAt: { gt: new Date(now.getTime() - UPGRADE_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (upgrading) return "upgrade_in_progress";

  if (sub.kind === "AGENCY") return chargeAgency(sub, now, periodStart);

  // 2) Сумма — та, на которую клиент дал согласие (или сумма запланированного плана, она меньше).
  //    Цена в каталоге изменилась → не списываем.
  const terms = await periodTerms(sub, periodStart);
  const amount = terms.amount;
  if (!amount) return setHold(sub, "NO_AMOUNT", "CS_BILLING_NO_AMOUNT");
  const plan = terms.plan;
  const catalog = plan === "BASIC" || plan === "PRO" ? PLAN_PRICING[plan].amount : null;
  if (catalog === null) return setHold(sub, "PLAN_NOT_IN_CATALOG", "CS_BILLING_PLAN");
  if (cents(amount) !== cents(catalog)) return setHold(sub, "PRICE_CHANGED", "CS_BILLING_PRICE_CHANGED");
  // Участник агентства (план HUB) — личную подписку не продлеваем, решает админ.
  if (sub.user.plan === "HUB") return setHold(sub, "AGENCY_MEMBER", "CS_BILLING_AGENCY_MEMBER");

  const attemptNo = sub.failedAttempts + 1;
  if (attemptNo > MAX_ATTEMPTS) return expire(sub, "payment_failed", now);

  // 3) Токен карты. Нет активного — как жёсткий отказ (нужна новая карта).
  const pm = sub.paymentMethod;
  if (!pm || pm.status !== "ACTIVE") return applyFailure(sub, "hard", now, attemptNo, null);

  let res;
  try {
    res = await chargeSavedCard({
      userId: sub.userId,
      payerEmail: sub.user.email,
      plan: plan as "BASIC" | "PRO",
      subscriptionId: sub.id,
      periodStart,
      attemptNo,
      amount: Number(amount),
      customerId: pm.tmsCustomerId,
      paymentInstrumentId: pm.tmsPaymentInstrumentId,
      previousTransactionId: sub.initialNetworkTransactionId ?? undefined,
    });
  } catch (e) {
    // Сумма ниже минимальной и т.п. — до запроса в CyberSource.
    log({ subscriptionId: sub.id, error: e instanceof Error ? e.message : String(e) }, "error");
    return setHold(sub, "CHARGE_REJECTED_LOCALLY", "CS_BILLING_LOCAL");
  }
  if (res.kind === "duplicate") return `duplicate:${res.status}`;

  const o = res.outcome;
  log({ subscriptionId: sub.id, paymentId: res.paymentId, attemptNo, outcome: o.kind, csTransactionId: "requestId" in o ? o.requestId : null });
  switch (o.kind) {
    case "approved":
      return applySuccess(sub, res.paymentId, now);
    case "declined":
      return applyFailure(sub, classifyDecline({ reason: o.details.reason ?? o.status, merchantAdviceCode: o.details.merchantAdviceCode }), now, attemptNo, res.paymentId);
    case "review":
      return setHold(sub, "REVIEW", "CS_BILLING_REVIEW");
    case "unknown":
      return "unknown"; // Payment UNKNOWN — следующий запуск сверит
    default: // invalid / auth_error / not_found — наша сторона
      return applyFailure(sub, "config", now, attemptNo, res.paymentId);
  }
}

// Попытка с неясным исходом: сверка по нашему reference code (Payment.order).
async function reconcileAttempt(sub: Sub, payment: { id: string; order: string; status: string; createdAt: Date; attemptNo: number | null }, now: Date): Promise<string> {
  const age = now.getTime() - payment.createdAt.getTime();
  if (payment.status === "PENDING" && age < IN_FLIGHT_MS) return "in_flight";
  const s = await findByReferenceCode(payment.order);
  if (!s.ok) return "reconcile_unavailable";
  await prisma.paymentOperation.create({
    data: { paymentId: payment.id, type: "RECONCILE", outcome: s.verdict, requestId: s.transactionId, httpStatus: 201 },
  });
  const attemptNo = payment.attemptNo ?? sub.failedAttempts + 1;
  if (s.verdict === "approved") {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "PAID", csTransactionId: s.transactionId, declineReason: null } });
    return applySuccess(sub, payment.id, now);
  }
  if (s.verdict === "declined") {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", csTransactionId: s.transactionId, declineReason: "DECLINED_RECONCILED" } });
    return applyFailure(sub, "soft", now, attemptNo, payment.id);
  }
  if (s.verdict === "not_found" && age > NOT_FOUND_GIVE_UP_MS) {
    // Запрос не дошёл до CyberSource — денег не списано; считаем мягкой неудачей попытки.
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", declineReason: "NOT_FOUND_AFTER_TIMEOUT" } });
    return applyFailure(sub, "soft", now, attemptNo, payment.id);
  }
  return s.verdict === "not_found" ? "waiting_index" : "reconcile_unknown";
}

async function applySuccess(sub: Sub, paymentId: string, now: Date): Promise<string> {
  if (sub.kind === "AGENCY") return applyAgencySuccess(sub, paymentId, now);
  const anchor = sub.anchorAt ?? sub.currentPeriodStart;
  const newEnd = nextPeriodEnd(anchor, sub.currentPeriodEnd);
  // План нового периода — тот, за который реально списали (Payment.plan / amount). Так смена плана
  // применяется ровно вместе с оплатой, даже если клиент менял выбор, пока шло списание.
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  const paidPlan = p?.plan ?? sub.plan;
  const planChanged = paidPlan !== sub.plan;
  const done = await prisma.$transaction(async (tx) => {
    // Условие на currentPeriodEnd — продление ровно один раз.
    const upd = await tx.subscription.updateMany({
      where: { id: sub.id, currentPeriodEnd: sub.currentPeriodEnd },
      data: {
        status: "ACTIVE",
        anchorAt: anchor,
        currentPeriodStart: sub.currentPeriodEnd,
        currentPeriodEnd: newEnd,
        nextChargeAt: chargeDueFor(newEnd),
        failedAttempts: 0,
        graceEndsAt: null,
        reminderSentFor: null,
        ...(planChanged && p ? { plan: p.plan, amount: p.amount, currency: p.currency } : {}),
        // Запланированная смена выполнена — сбрасываем. Иначе (другой план) оставляем как есть.
        ...(sub.pendingPlan && sub.pendingPlan === paidPlan
          ? { pendingPlan: null, pendingAmount: null, pendingFrom: null, pendingSetAt: null }
          : {}),
      },
    });
    if (upd.count === 0) return false;
    // planActivatedAt (якорь лимитов) не трогаем; ставим только если план был сброшен.
    await tx.user.update({
      where: { id: sub.userId },
      data: { plan: paidPlan, planExpiresAt: newEnd, ...(sub.user.planActivatedAt ? {} : { planActivatedAt: now }) },
    });
    return true;
  });
  if (!done) return "already_extended";

  if (p) {
    try {
      await sendReceiptEmail(sub.user.email, {
        order: p.order,
        amount: p.amount,
        currency: p.currency,
        customerName: sub.user.name,
        plan: p.plan,
        purpose: "SUBSCRIPTION",
        rrn: null,
        approval: p.approval,
        cardLast4: sub.paymentMethod?.cardLast4 ?? null,
        cardNetwork: sub.paymentMethod?.cardBrand ?? null,
        paidAt: now,
      });
    } catch (e) {
      log({ subscriptionId: sub.id, warn: "receipt_email_failed", message: e instanceof Error ? e.message : String(e) }, "warn");
    }
    if (planChanged) {
      try {
        await sendPlanChangedAtRenewalEmail(sub.user.email, {
          name: sub.user.name,
          fromPlan: sub.plan,
          toPlan: p.plan,
          amount: p.amount,
          currency: p.currency,
          paidUntil: newEnd,
        });
      } catch (e) {
        log({ subscriptionId: sub.id, warn: "plan_changed_email_failed", message: e instanceof Error ? e.message : String(e) }, "warn");
      }
    }
  }
  return planChanged ? "charged_plan_changed" : "charged";
}

async function applyFailure(sub: Sub, cls: DeclineClass, now: Date, attemptNo: number, paymentId: string | null): Promise<string> {
  if (sub.kind === "AGENCY") return applyAgencyFailure(sub, cls, now, attemptNo, paymentId);
  const periodEnd = sub.currentPeriodEnd;
  const grace = graceEndsFor(periodEnd);
  const terms = await periodTerms(sub, periodEnd);
  const amount = terms.amount ?? "";

  if (cls === "config") {
    // Ошибка на нашей стороне — клиенту не пишем, доступ сохраняем на грейс, ждём админа.
    await prisma.user.update({ where: { id: sub.userId }, data: { planExpiresAt: grace } });
    return setHold(sub, "CONFIG_ERROR", "CS_BILLING_CONFIG");
  }

  const next = cls === "soft" ? attemptDueAt(periodEnd, attemptNo + 1) : null;
  if (cls === "soft" && next === null) return expire(sub, "payment_failed", now); // последняя попытка

  // Условие на failedAttempts — одна неудача учитывается ровно один раз.
  const upd = await prisma.subscription.updateMany({
    where: { id: sub.id, failedAttempts: attemptNo - 1 },
    data: { status: "PAST_DUE", failedAttempts: attemptNo, nextChargeAt: next, graceEndsAt: grace },
  });
  if (upd.count === 0) return "failure_already_applied";
  await prisma.user.update({ where: { id: sub.userId }, data: { planExpiresAt: grace } });
  log({ subscriptionId: sub.id, paymentId, attemptNo, class: cls, nextAttemptAt: next?.toISOString() ?? null }, "warn");
  try {
    await sendBillingFailedEmail(sub.user.email, { name: sub.user.name, plan: terms.plan, amount, currency: sub.currency ?? "MDL", kind: cls, nextAttemptAt: next, accessUntil: grace });
  } catch (e) {
    log({ subscriptionId: sub.id, warn: "failed_email_failed", message: e instanceof Error ? e.message : String(e) }, "warn");
  }
  return cls === "soft" ? "soft_failed_retry_scheduled" : "hard_failed";
}

async function expire(sub: Sub, reason: "canceled" | "payment_failed", now: Date): Promise<string> {
  const upd = await prisma.subscription.updateMany({
    where: { id: sub.id, status: { in: ["ACTIVE", "PAST_DUE", "CANCELED"] } },
    data: { status: "EXPIRED", nextChargeAt: null, graceEndsAt: null, canceledAt: sub.canceledAt ?? (reason === "canceled" ? now : null) },
  });
  if (upd.count === 0) return "already_expired";

  if (sub.kind === "AGENCY") {
    await prisma.subscription.update({ where: { id: sub.id }, data: { pendingSeats: null, pendingAmount: null, pendingFrom: null, pendingSetAt: null } });
    await endAgencyAccess(sub, now);
  } else {
    // План сбрасываем, только если он от этой подписки; разлогин — как в check-expired-plans.
    await prisma.user.updateMany({
      where: { id: sub.userId, plan: sub.plan },
      data: { plan: null, planActivatedAt: null, planExpiresAt: null, sessionVersion: { increment: 1 } },
    });
  }

  // Токен в CyberSource больше не нужен (если его не использует другая живая подписка; общий
  // TMS customer с другой активной картой — удаляется только эта карта).
  const pm = sub.paymentMethod;
  if (pm && pm.status === "ACTIVE") {
    const lastPayment = await prisma.payment.findFirst({ where: { subscriptionId: sub.id }, orderBy: { createdAt: "desc" }, select: { id: true } });
    const r = await retirePaymentMethod({ paymentMethodId: pm.id, paymentId: lastPayment?.id ?? null, now });
    if (r === "error") log({ subscriptionId: sub.id, alert: "CS_BILLING_TOKEN_DELETE_FAILED" }, "error");
  }

  try {
    if (sub.kind === "AGENCY") await sendAgencySubscriptionEndedEmail(sub.user.email, { name: sub.user.name, reason });
    else await sendSubscriptionEndedEmail(sub.user.email, { name: sub.user.name, plan: sub.plan, reason });
  } catch (e) {
    log({ subscriptionId: sub.id, warn: "ended_email_failed", message: e instanceof Error ? e.message : String(e) }, "warn");
  }
  log({ subscriptionId: sub.id, expired: reason }, "warn");
  return reason === "canceled" ? "expired_canceled" : "expired_payment_failed";
}

// «Plătește acum»: списание просроченного периода по текущей (новой) карте — тот же механизм,
// что у cron (сверка незавершённой попытки, сумма согласия, ключ идемпотентности попытки).
// Вызывающий проверяет право (lib/subscription-rules.ts → canPayNow) и владельца.
export async function chargeSubscriptionNow(subscriptionId: string, now: Date = new Date()): Promise<string> {
  const sub = (await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: SUB_INCLUDE,
  })) as Sub | null;
  if (!sub || sub.status !== "PAST_DUE" || sub.cancelAtPeriodEnd || sub.billingHold) return "not_allowed";
  if (sub.failedAttempts >= MAX_ATTEMPTS) return "not_allowed";
  const result = await charge(sub, now);
  log({ subscriptionId: sub.id, action: "pay_now", result });
  return result;
}

// Флаг включения автосписаний из cron (по умолчанию выключен).
export function billingEnabled(): boolean {
  return (process.env.CS_BILLING_ENABLED ?? "").trim().toLowerCase() === "true";
}

// ── Агентская подписка (kind AGENCY) ──────────────────────────────────────────

// Места подписки, цена места и сумма последнего согласия (согласие записывается при каждом
// изменении мест, поэтому сверяем именно с последним, а не с полем amount).
async function agencyState(sub: Sub): Promise<{ s: AgencySub; price: number; consent: string | null } | null> {
  if (!sub.agency) return null;
  const first = sub.seats
    ? null
    : await prisma.payment.findFirst({
        where: { subscriptionId: sub.id, purpose: "AGENCY_SEATS", initiator: "CUSTOMER", status: "PAID" },
        orderBy: { createdAt: "asc" },
        select: { seats: true },
      });
  const seats = effectiveSeats(sub.seats, first?.seats ?? sub.agency.seatsPaid);
  if (!seats) return null;
  const c = await prisma.recurringConsent.findFirst({ where: { subscriptionId: sub.id }, orderBy: { acceptedAt: "desc" }, select: { amount: true } });
  return { s: { ...sub, seats }, price: sub.agency.pricePerSeatMdl, consent: c?.amount ?? null };
}

async function remindAgency(sub: Sub): Promise<string> {
  if (!sub.nextChargeAt) return "none";
  const st = await agencyState(sub);
  if (!st) return "none";
  const claim = await prisma.subscription.updateMany({
    where: { id: sub.id, OR: [{ reminderSentFor: null }, { NOT: { reminderSentFor: sub.currentPeriodEnd } }] },
    data: { reminderSentFor: sub.currentPeriodEnd },
  });
  if (claim.count === 0) return "reminder_already_sent";
  const t = agencyChargeTerms(st.s, sub.currentPeriodEnd, st.price, st.consent);
  try {
    await sendAgencyBillingReminderEmail(sub.user.email, {
      name: sub.user.name,
      seats: t.seats,
      amount: t.amount,
      currency: sub.currency ?? "MDL",
      chargeAt: sub.nextChargeAt,
      fromSeats: t.changed ? st.s.seats : null,
    });
  } catch (e) {
    log({ subscriptionId: sub.id, warn: "reminder_email_failed", message: e instanceof Error ? e.message : String(e) }, "warn");
  }
  return "reminder_sent";
}

async function chargeAgency(sub: Sub, now: Date, periodStart: Date): Promise<string> {
  // Владелец сейчас оплачивает докупку мест — ждём её исхода (иначе новый период списался бы со
  // старым числом мест). Брошенная оплата перестаёт мешать через час.
  const topup = await prisma.payment.findFirst({
    where: {
      subscriptionId: sub.id,
      purpose: "AGENCY_TOPUP",
      initiator: "CUSTOMER",
      status: { in: ["PENDING", "UNKNOWN"] },
      createdAt: { gt: new Date(now.getTime() - UPGRADE_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (topup) return "topup_in_progress";

  const st = await agencyState(sub);
  if (!st) return setHold(sub, "NO_SEATS", "CS_BILLING_AGENCY_NO_SEATS");
  const t = agencyChargeTerms(st.s, periodStart, st.price, st.consent);
  if (!st.consent) return setHold(sub, "NO_AMOUNT", "CS_BILLING_NO_AMOUNT");
  // Цена места изменилась (или согласие на другую сумму) — не списываем, решает админ.
  if (!t.consentOk) return setHold(sub, "PRICE_CHANGED", "CS_BILLING_PRICE_CHANGED");

  const attemptNo = sub.failedAttempts + 1;
  if (attemptNo > MAX_ATTEMPTS) return expire(sub, "payment_failed", now);
  const pm = sub.paymentMethod;
  if (!pm || pm.status !== "ACTIVE") return applyFailure(sub, "hard", now, attemptNo, null);

  let res;
  try {
    res = await chargeSavedCard({
      userId: sub.userId,
      payerEmail: sub.user.email,
      plan: "HUB",
      purpose: "AGENCY_SEATS",
      seats: t.seats,
      subscriptionId: sub.id,
      periodStart,
      attemptNo,
      amount: Number(t.amount),
      customerId: pm.tmsCustomerId,
      paymentInstrumentId: pm.tmsPaymentInstrumentId,
      previousTransactionId: sub.initialNetworkTransactionId ?? undefined,
    });
  } catch (e) {
    log({ subscriptionId: sub.id, error: e instanceof Error ? e.message : String(e) }, "error");
    return setHold(sub, "CHARGE_REJECTED_LOCALLY", "CS_BILLING_LOCAL");
  }
  if (res.kind === "duplicate") return `duplicate:${res.status}`;

  const o = res.outcome;
  log({ subscriptionId: sub.id, paymentId: res.paymentId, attemptNo, seats: t.seats, outcome: o.kind, csTransactionId: "requestId" in o ? o.requestId : null });
  switch (o.kind) {
    case "approved":
      return applySuccess(sub, res.paymentId, now);
    case "declined":
      return applyFailure(sub, classifyDecline({ reason: o.details.reason ?? o.status, merchantAdviceCode: o.details.merchantAdviceCode }), now, attemptNo, res.paymentId);
    case "review":
      return setHold(sub, "REVIEW", "CS_BILLING_REVIEW");
    case "unknown":
      return "unknown";
    default:
      return applyFailure(sub, "config", now, attemptNo, res.paymentId);
  }
}

// Успешное списание: новый период, места = оплаченные (Payment.seats), сумма = оплаченная;
// запланированное уменьшение выполнено. Доступ участников — Agency.planExpiresAt = конец периода.
// Личный план владельца не трогаем (у владельца может не быть места в агентстве).
async function applyAgencySuccess(sub: Sub, paymentId: string, now: Date): Promise<string> {
  const anchor = sub.anchorAt ?? sub.currentPeriodStart;
  const newEnd = nextPeriodEnd(anchor, sub.currentPeriodEnd);
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  const st = await agencyState(sub);
  const prevSeats = st?.s.seats ?? null;
  const paidSeats = p?.seats ?? prevSeats;
  const seatsChanged = paidSeats != null && prevSeats != null && paidSeats !== prevSeats;
  const done = await prisma.$transaction(async (tx) => {
    const upd = await tx.subscription.updateMany({
      where: { id: sub.id, currentPeriodEnd: sub.currentPeriodEnd },
      data: {
        status: "ACTIVE",
        anchorAt: anchor,
        currentPeriodStart: sub.currentPeriodEnd,
        currentPeriodEnd: newEnd,
        nextChargeAt: chargeDueFor(newEnd),
        failedAttempts: 0,
        graceEndsAt: null,
        reminderSentFor: null,
        ...(paidSeats != null ? { seats: paidSeats } : {}),
        ...(p ? { amount: p.amount, currency: p.currency } : {}),
        ...(sub.pendingSeats != null && sub.pendingSeats === paidSeats
          ? { pendingSeats: null, pendingAmount: null, pendingFrom: null, pendingSetAt: null }
          : {}),
      },
    });
    if (upd.count === 0) return null;
    if (!sub.agencyId) return null;
    const ag = await tx.agency.update({
      where: { id: sub.agencyId },
      data: { planExpiresAt: newEnd, ...(paidSeats != null ? { seatsPaid: paidSeats } : {}) },
      select: { seatsPaid: true, planExpiresAt: true, _count: { select: { memberships: true } } },
    });
    return ag;
  });
  if (!done) return "already_extended";
  if (done._count.memberships > done.seatsPaid) {
    log({ subscriptionId: sub.id, warn: "AGENCY_MEMBERS_OVER_SEATS", members: done._count.memberships, seats: done.seatsPaid }, "warn");
  }

  if (p) {
    try {
      await sendReceiptEmail(sub.user.email, {
        order: p.order,
        amount: p.amount,
        currency: p.currency,
        customerName: sub.user.name,
        plan: p.plan,
        purpose: "AGENCY_SEATS",
        seats: p.seats,
        agency: agencyReceiptInfo(p, done),
        rrn: null,
        approval: p.approval,
        cardLast4: sub.paymentMethod?.cardLast4 ?? null,
        cardNetwork: sub.paymentMethod?.cardBrand ?? null,
        paidAt: now,
      });
    } catch (e) {
      log({ subscriptionId: sub.id, warn: "receipt_email_failed", message: e instanceof Error ? e.message : String(e) }, "warn");
    }
    if (seatsChanged && prevSeats != null && paidSeats != null) {
      try {
        await sendAgencySeatsChangedAtRenewalEmail(sub.user.email, {
          name: sub.user.name,
          fromSeats: prevSeats,
          toSeats: paidSeats,
          amount: p.amount,
          currency: p.currency,
          paidUntil: newEnd,
        });
      } catch (e) {
        log({ subscriptionId: sub.id, warn: "seats_changed_email_failed", message: e instanceof Error ? e.message : String(e) }, "warn");
      }
    }
  }
  return seatsChanged ? "charged_seats_changed" : "charged";
}

async function setAgencyAccessUntil(sub: Sub, until: Date) {
  if (sub.agencyId) await prisma.agency.update({ where: { id: sub.agencyId }, data: { planExpiresAt: until } });
}

async function applyAgencyFailure(sub: Sub, cls: DeclineClass, now: Date, attemptNo: number, paymentId: string | null): Promise<string> {
  const periodEnd = sub.currentPeriodEnd;
  const grace = graceEndsFor(periodEnd);
  if (cls === "config") {
    await setAgencyAccessUntil(sub, grace);
    return setHold(sub, "CONFIG_ERROR", "CS_BILLING_CONFIG");
  }
  const next = cls === "soft" ? attemptDueAt(periodEnd, attemptNo + 1) : null;
  if (cls === "soft" && next === null) return expire(sub, "payment_failed", now);

  const upd = await prisma.subscription.updateMany({
    where: { id: sub.id, failedAttempts: attemptNo - 1 },
    data: { status: "PAST_DUE", failedAttempts: attemptNo, nextChargeAt: next, graceEndsAt: grace },
  });
  if (upd.count === 0) return "failure_already_applied";
  // Владелец и участники сохраняют доступ до конца грейса.
  await setAgencyAccessUntil(sub, grace);
  log({ subscriptionId: sub.id, paymentId, attemptNo, class: cls, nextAttemptAt: next?.toISOString() ?? null }, "warn");
  const st = await agencyState(sub);
  const t = st ? agencyChargeTerms(st.s, periodEnd, st.price, st.consent) : null;
  try {
    await sendAgencyBillingFailedEmail(sub.user.email, {
      name: sub.user.name,
      seats: t?.seats ?? 0,
      amount: t?.amount ?? "",
      currency: sub.currency ?? "MDL",
      kind: cls,
      nextAttemptAt: next,
      accessUntil: grace,
    });
  } catch (e) {
    log({ subscriptionId: sub.id, warn: "failed_email_failed", message: e instanceof Error ? e.message : String(e) }, "warn");
  }
  return cls === "soft" ? "soft_failed_retry_scheduled" : "hard_failed";
}

// Конец агентской подписки: срок агентства = сейчас, HUB снимается у всех участников сразу
// (как revokeExpiredAgencies: plan=null + sessionVersion++). Агентство и участники остаются —
// доступ вернётся при новой покупке.
async function endAgencyAccess(sub: Sub, now: Date) {
  if (!sub.agencyId) return;
  await prisma.$transaction(async (tx) => {
    await tx.agency.update({ where: { id: sub.agencyId! }, data: { planExpiresAt: now } });
    const members = await tx.agencyMembership.findMany({ where: { agencyId: sub.agencyId! }, select: { userId: true } });
    if (members.length) {
      await tx.user.updateMany({
        where: { id: { in: members.map((m) => m.userId) }, plan: "HUB" },
        data: { plan: null, planActivatedAt: null, planExpiresAt: null, sessionVersion: { increment: 1 } },
      });
    }
  });
}

// Только для тестов на реальной БД (без сети): переходы после исхода списания.
export const billingTestHooks = {
  loadSub: (id: string) => prisma.subscription.findUniqueOrThrow({ where: { id }, include: SUB_INCLUDE }) as Promise<Sub>,
  applySuccess: (sub: Sub, paymentId: string, now: Date) => applySuccess(sub, paymentId, now),
  applyFailure: (sub: Sub, cls: DeclineClass, now: Date, attemptNo: number) => applyFailure(sub, cls, now, attemptNo, null),
};
