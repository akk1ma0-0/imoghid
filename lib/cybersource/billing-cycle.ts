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
// Агентские подписки (kind AGENCY) пока пропускаются.
import type { PaymentMethod, Subscription } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { PLAN_PRICING } from "@/lib/payments";
import { chargeSavedCard } from "@/lib/cybersource/payments";
import { findByReferenceCode } from "@/lib/cybersource/search";
import { deleteCustomer } from "@/lib/cybersource/tms";
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
  sendBillingFailedEmail,
  sendBillingReminderEmail,
  sendReceiptEmail,
  sendSubscriptionEndedEmail,
} from "@/lib/email";

const IN_FLIGHT_MS = 15 * 60 * 1000; // PENDING-попытка моложе — её ещё обрабатывает другой запуск
const NOT_FOUND_GIVE_UP_MS = 60 * 60 * 1000; // UNKNOWN, которого нет в CyberSource через час, — не прошёл

type Sub = Subscription & {
  paymentMethod: PaymentMethod | null;
  user: { id: string; email: string; name: string; plan: string | null; planActivatedAt: Date | null };
};

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
    include: { paymentMethod: true, user: { select: { id: true, email: true, name: true, plan: true, planActivatedAt: true } } },
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
    case "skip_agency":
      return "skipped_agency";
    case "hold":
      return `hold:${sub.billingHold}`;
    case "remind":
      return remind(sub);
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

async function remind(sub: Sub): Promise<string> {
  if (!sub.nextChargeAt) return "none";
  // Клейм письма на этот период — повторный запуск не отправит второе.
  const claim = await prisma.subscription.updateMany({
    where: { id: sub.id, OR: [{ reminderSentFor: null }, { NOT: { reminderSentFor: sub.currentPeriodEnd } }] },
    data: { reminderSentFor: sub.currentPeriodEnd },
  });
  if (claim.count === 0) return "reminder_already_sent";
  const amount = (await consentedAmount(sub)) ?? "";
  try {
    await sendBillingReminderEmail(sub.user.email, { name: sub.user.name, plan: sub.plan, amount, currency: sub.currency ?? "MDL", chargeAt: sub.nextChargeAt });
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

  // 2) Сумма — та, на которую клиент дал согласие. Цена в каталоге изменилась → не списываем.
  const amount = await consentedAmount(sub);
  if (!amount) return setHold(sub, "NO_AMOUNT", "CS_BILLING_NO_AMOUNT");
  const catalog = sub.plan === "BASIC" || sub.plan === "PRO" ? PLAN_PRICING[sub.plan].amount : null;
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
      plan: sub.plan,
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
  const anchor = sub.anchorAt ?? sub.currentPeriodStart;
  const newEnd = nextPeriodEnd(anchor, sub.currentPeriodEnd);
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
      },
    });
    if (upd.count === 0) return false;
    // planActivatedAt (якорь лимитов) не трогаем; ставим только если план был сброшен.
    await tx.user.update({
      where: { id: sub.userId },
      data: { plan: sub.plan, planExpiresAt: newEnd, ...(sub.user.planActivatedAt ? {} : { planActivatedAt: now }) },
    });
    return true;
  });
  if (!done) return "already_extended";

  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
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
  }
  return "charged";
}

async function applyFailure(sub: Sub, cls: DeclineClass, now: Date, attemptNo: number, paymentId: string | null): Promise<string> {
  const periodEnd = sub.currentPeriodEnd;
  const grace = graceEndsFor(periodEnd);
  const amount = (await consentedAmount(sub)) ?? "";

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
    await sendBillingFailedEmail(sub.user.email, { name: sub.user.name, plan: sub.plan, amount, currency: sub.currency ?? "MDL", kind: cls, nextAttemptAt: next, accessUntil: grace });
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

  // План сбрасываем, только если он от этой подписки; разлогин — как в check-expired-plans.
  await prisma.user.updateMany({
    where: { id: sub.userId, plan: sub.plan },
    data: { plan: null, planActivatedAt: null, planExpiresAt: null, sessionVersion: { increment: 1 } },
  });

  // Токен в CyberSource больше не нужен.
  const pm = sub.paymentMethod;
  if (pm && pm.status === "ACTIVE") {
    const del = await deleteCustomer(pm.tmsCustomerId);
    const lastPayment = await prisma.payment.findFirst({ where: { subscriptionId: sub.id }, orderBy: { createdAt: "desc" }, select: { id: true } });
    await prisma.paymentOperation.create({
      data: { paymentId: lastPayment?.id ?? null, type: "TOKEN_DELETE", outcome: del.ok ? (del.alreadyGone ? "already_gone" : "deleted") : "error", httpStatus: del.ok ? 204 : del.httpStatus },
    });
    if (del.ok) await prisma.paymentMethod.update({ where: { id: pm.id }, data: { status: "REMOVED", removedAt: now } });
    else log({ subscriptionId: sub.id, alert: "CS_BILLING_TOKEN_DELETE_FAILED", httpStatus: del.httpStatus }, "error");
  }

  try {
    await sendSubscriptionEndedEmail(sub.user.email, { name: sub.user.name, plan: sub.plan, reason });
  } catch (e) {
    log({ subscriptionId: sub.id, warn: "ended_email_failed", message: e instanceof Error ? e.message : String(e) }, "warn");
  }
  log({ subscriptionId: sub.id, expired: reason }, "warn");
  return reason === "canceled" ? "expired_canceled" : "expired_payment_failed";
}

// Флаг включения автосписаний из cron (по умолчанию выключен).
export function billingEnabled(): boolean {
  return (process.env.CS_BILLING_ENABLED ?? "").trim().toLowerCase() === "true";
}
