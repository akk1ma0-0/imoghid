// Завершение первой оплаты клиента (CIT) через Unified Checkout.
//
// Порядок (идемпотентно, как callback VictoriaBank):
//   1) Payment принадлежит пользователю, провайдер CYBERSOURCE/CUSTOMER; PAID → ничего не делаем;
//   2) атомарный клейм completionStartedAt (параллельный/повторный вызов выходит сразу);
//   3) транзакцию ищем САМИ у CyberSource: кандидаты id из присланного JWT → детали
//      (GET /tss/v2/transactions/{id}); нет — поиск по нашему reference code (search.ts);
//   4) проверка суммы/валюты/статуса/reference (cit-validation.ts);
//   5) PaymentMethod + Subscription + привязка RecurringConsent (одна транзакция БД, recordCitSuccess);
//      при переходе Basic → Pro (Payment.replacesSubscriptionId) в той же транзакции закрывается
//      старая подписка, а её токен удаляется уже после транзакции; затем fulfillPaidPayment
//      (план / места; planActivatedAt = дата оплаты) и чек.
// Неясный исход (сеть, 5xx, транзакция ещё не найдена, статус не финальный) → UNKNOWN,
// клейм снимается — повторный вызов/сверка продолжит с того же места.
import type { Payment, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { fulfillPaidPayment, isAttributed } from "@/lib/billing";
import { agencyReceiptInfo, sendReceiptEmail } from "@/lib/email";
import { effectiveSeats, seatsAmount } from "@/lib/agency-subscription-rules";
import { getTransactionDetails } from "@/lib/cybersource/checkout";
import { findByReferenceCode } from "@/lib/cybersource/search";
import { addMonthsAnchored, chargeDueFor } from "@/lib/billing-period";
import { retirePaymentMethod } from "@/lib/cybersource/token-retire";
import {
  CIT_FINAL_FAILURES,
  decodeJwtPayload,
  jwtKeyPaths,
  paymentTransactionIds,
  transactionIdCandidates,
  validateCitCompletion,
  type TxnFacts,
} from "@/lib/cybersource/cit-validation";

const LOG_TAG = "[CS complete]";

export type CitResult =
  | { status: "paid" }
  | { status: "already_paid" }
  | { status: "processing" } // другой вызов сейчас обрабатывает этот платёж
  | { status: "unknown" } // исход ещё не ясен — повторить позже (сверка)
  | { status: "declined" }
  | { status: "failed"; code: string }
  | { status: "not_found" };

function log(line: Record<string, unknown>) {
  console.info(JSON.stringify({ evt: "cs_cit_complete", ...line }));
}

// Ищем транзакцию ОПЛАТЫ этого платежа (ics_auth / ics_bill): сначала по id из JWT браузера,
// затем по нашему reference code. Под тем же reference code Unified Checkout создаёт и
// 3DS-транзакции (ics_pa_setup / ics_pa_enroll) — они пропускаются. Индекс CyberSource отстаёт
// на секунды: 404 на деталях и «оплата в поиске ещё не видна» — это «ещё не проиндексировано»
// (facts=null → UNKNOWN и повтор), а не повод взять другую транзакцию.
// transient=true — была сетевая/серверная ошибка; notIndexed=true — был 404 / ничего не найдено.
export async function locateTransaction(
  payment: Payment,
  resultJwt: unknown,
): Promise<{ facts: TxnFacts | null; transient: boolean; notIndexed: boolean }> {
  let transient = false;
  let notIndexed = false;
  const tryIds = async (ids: string[]) => {
    for (const id of ids) {
      const d = await getTransactionDetails(id);
      if (d.ok && d.facts.isPayment && d.facts.referenceCode === payment.order) return d.facts;
      if (!d.ok && d.httpStatus === 404) notIndexed = true;
      else if (!d.ok && (d.httpStatus === 0 || d.httpStatus >= 500)) transient = true;
    }
    return null;
  };
  let facts = await tryIds(transactionIdCandidates(decodeJwtPayload(resultJwt)));
  if (!facts) {
    const s = await findByReferenceCode(payment.order);
    if (s.ok) {
      const ids = paymentTransactionIds(s.summaries).slice(0, 3);
      if (ids.length === 0) notIndexed = true; // в поиске пока только 3DS-транзакции или ничего
      facts = await tryIds(ids);
    } else if (s.httpStatus === 0 || s.httpStatus >= 500) transient = true;
  }
  return { facts, transient, notIndexed };
}

export type CitRecords = {
  subscriptionId: string | null;
  periodStart: Date;
  periodEnd: Date;
  replacedSubscription: boolean; // старая подписка закрыта этим вызовом
  retirePaymentMethodId: string | null; // токен старой подписки — удалить ПОСЛЕ транзакции
  // Только AGENCY_TOPUP: места после докупки и агентство (для чека); applied=false — подписка уже
  // закончилась к моменту оплаты, места не добавлены (нужен ручной возврат).
  topup?: { applied: boolean; newSeats: number; agency: { seatsPaid: number; planExpiresAt: Date | null } | null };
};

// Докупка мест (AGENCY_TOPUP) к агентской подписке — внутри транзакции recordCitSuccess.
// Период подписки не меняется; места = прежние + N, месячная сумма = места × цена; карта, введённая
// при докупке, становится картой подписки (старый токен удаляется после транзакции); согласие на новую
// сумму привязывается к подписке. Признак «уже применено» — Payment.status PAID (та же транзакция).
async function applyAgencyTopup(tx: Prisma.TransactionClient, payment: Payment, facts: TxnFacts, now: Date): Promise<CitRecords> {
  const sub = payment.subscriptionId
    ? await tx.subscription.findUnique({ where: { id: payment.subscriptionId }, include: { agency: true } })
    : null;
  if (!sub || sub.userId !== payment.userId || sub.kind !== "AGENCY" || !sub.agency) throw new Error("AGENCY_TOPUP without agency subscription");
  const base = { subscriptionId: sub.id, periodStart: sub.currentPeriodStart, periodEnd: sub.currentPeriodEnd, replacedSubscription: false };
  if (payment.status === "PAID") {
    return { ...base, retirePaymentMethodId: null, topup: { applied: true, newSeats: sub.seats ?? sub.agency.seatsPaid, agency: sub.agency } };
  }
  const alive =
    sub.status === "ACTIVE" || sub.status === "PAST_DUE" || (sub.status === "CANCELED" && sub.cancelAtPeriodEnd && sub.currentPeriodEnd > now);
  if (!alive) {
    await tx.payment.update({ where: { id: payment.id }, data: { status: "PAID", rc: "00" } });
    console.error(JSON.stringify({ evt: "cs_cit_complete", paymentId: payment.id, subscriptionId: sub.id, alert: "CS_TOPUP_SUBSCRIPTION_ENDED" }));
    return { ...base, retirePaymentMethodId: null, topup: { applied: false, newSeats: sub.seats ?? 0, agency: sub.agency } };
  }
  let seatsNow = effectiveSeats(sub.seats, null);
  if (!seatsNow) {
    const first = await tx.payment.findFirst({
      where: { subscriptionId: sub.id, purpose: "AGENCY_SEATS", initiator: "CUSTOMER", status: "PAID" },
      orderBy: { createdAt: "asc" },
      select: { seats: true },
    });
    seatsNow = effectiveSeats(first?.seats, sub.agency.seatsPaid) ?? 0;
  }
  const newSeats = seatsNow + (payment.seats ?? 0);

  let newPmId: string | null = null;
  if (facts.customerId && facts.paymentInstrumentId) {
    const card = { cardLast4: facts.cardLast4, cardBrand: facts.cardBrand, expMonth: facts.expMonth, expYear: facts.expYear };
    const pm = await tx.paymentMethod.upsert({
      where: { tmsPaymentInstrumentId: facts.paymentInstrumentId },
      create: { userId: payment.userId!, tmsCustomerId: facts.customerId, tmsPaymentInstrumentId: facts.paymentInstrumentId, ...card },
      update: { ...card, status: "ACTIVE", removedAt: null },
    });
    newPmId = pm.id;
  }
  await tx.subscription.update({
    where: { id: sub.id },
    data: {
      seats: newSeats,
      amount: seatsAmount(newSeats, sub.agency.pricePerSeatMdl),
      ...(newPmId ? { paymentMethodId: newPmId } : {}),
      ...(newPmId && facts.networkTransactionId ? { initialNetworkTransactionId: facts.networkTransactionId } : {}),
    },
  });
  const agency = await tx.agency.update({ where: { id: sub.agency.id }, data: { seatsPaid: newSeats }, select: { seatsPaid: true, planExpiresAt: true } });
  await tx.recurringConsent.updateMany({ where: { paymentId: payment.id }, data: { subscriptionId: sub.id } });
  await tx.payment.update({ where: { id: payment.id }, data: { status: "PAID", rc: "00" } });
  const oldPmId = sub.paymentMethodId;
  return {
    ...base,
    retirePaymentMethodId: newPmId && oldPmId && oldPmId !== newPmId ? oldPmId : null,
    topup: { applied: true, newSeats, agency },
  };
}

// Записи после подтверждённой оплаты (CIT) — одна транзакция БД:
//   данные транзакции в Payment → (Basic → Pro) закрытие старой подписки → PaymentMethod →
//   новая подписка → привязка платежа и согласия.
// Идемпотентно и безопасно при параллельных вызовах: строка Payment блокируется (FOR UPDATE), и
// если подписка уже создана (payment.subscriptionId), второй вызов ничего не создаёт и возвращает
// тот же период. Ошибка на любом шаге откатывает всё, включая закрытие старой подписки.
// hooks.afterReplace — только для тестов (сбой посреди транзакции).
export async function recordCitSuccess(
  paymentId: string,
  facts: TxnFacts,
  now: Date,
  hooks: { afterReplace?: () => Promise<void> } = {},
): Promise<CitRecords> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "payments" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        csTransactionId: facts.id,
        networkTransactionId: facts.networkTransactionId,
        processorCode: facts.processorCode,
        approval: facts.approvalCode,
        cardLast4: facts.cardLast4,
      },
    });

    if (payment.purpose === "AGENCY_TOPUP") return applyAgencyTopup(tx, payment, facts, now);

    // Старая подписка (Basic → Pro): её токен удалим после транзакции, если он не нужен новой.
    const old = payment.replacesSubscriptionId
      ? await tx.subscription.findUnique({ where: { id: payment.replacesSubscriptionId }, select: { id: true, userId: true, paymentMethodId: true } })
      : null;
    const oldPmId = old && old.userId === payment.userId ? old.paymentMethodId : null;

    if (payment.subscriptionId) {
      // Повтор: всё уже записано — возвращаем период созданной подписки.
      const sub = await tx.subscription.findUniqueOrThrow({ where: { id: payment.subscriptionId } });
      return {
        subscriptionId: sub.id,
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
        replacedSubscription: false,
        retirePaymentMethodId: oldPmId && oldPmId !== sub.paymentMethodId ? oldPmId : null,
      };
    }

    // Период — календарный месяц от момента оплаты (якорь); списание — за сутки до его конца.
    const periodEnd = addMonthsAnchored(now, 1);
    let replaced = false;
    if (old && old.userId === payment.userId) {
      // Закрываем сразу, без возврата. cancelAtPeriodEnd=false: биллинг такую подписку не берёт
      // ни для списания, ни для «окончания» (иначе он сбросил бы план и удалил токен).
      const closed = await tx.subscription.updateMany({
        where: { id: old.id, userId: payment.userId, kind: "PERSONAL", status: { in: ["ACTIVE", "PAST_DUE", "CANCELED"] } },
        data: {
          status: "CANCELED",
          cancelAtPeriodEnd: false,
          canceledAt: now,
          nextChargeAt: null,
          graceEndsAt: null,
          pendingPlan: null,
          pendingAmount: null,
          pendingFrom: null,
          pendingSetAt: null,
        },
      });
      replaced = closed.count > 0;
      await hooks.afterReplace?.();
    }

    let subscriptionId: string | null = null;
    let newPmId: string | null = null;
    if (facts.customerId && facts.paymentInstrumentId) {
      const card = { cardLast4: facts.cardLast4, cardBrand: facts.cardBrand, expMonth: facts.expMonth, expYear: facts.expYear };
      const pm = await tx.paymentMethod.upsert({
        where: { tmsPaymentInstrumentId: facts.paymentInstrumentId },
        create: { userId: payment.userId!, tmsCustomerId: facts.customerId, tmsPaymentInstrumentId: facts.paymentInstrumentId, ...card },
        update: { ...card, status: "ACTIVE", removedAt: null },
      });
      newPmId = pm.id;
      const sub = await tx.subscription.create({
        data: {
          userId: payment.userId!,
          kind: payment.purpose === "AGENCY_SEATS" ? "AGENCY" : "PERSONAL",
          plan: payment.plan,
          status: "ACTIVE",
          provider: "CYBERSOURCE",
          paymentMethodId: pm.id,
          initialNetworkTransactionId: facts.networkTransactionId,
          anchorAt: now,
          amount: payment.amount, // сумма согласия — её и списываем ежемесячно
          currency: payment.currency,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          nextChargeAt: chargeDueFor(periodEnd),
        },
      });
      subscriptionId = sub.id;
      await tx.payment.update({ where: { id: payment.id }, data: { subscriptionId: sub.id } });
      await tx.recurringConsent.updateMany({ where: { paymentId: payment.id }, data: { subscriptionId: sub.id } });
    }
    return {
      subscriptionId,
      periodStart: now,
      periodEnd,
      replacedSubscription: replaced,
      retirePaymentMethodId: oldPmId && oldPmId !== newPmId ? oldPmId : null,
    };
  });
}

export async function completeCitPayment(args: {
  paymentId: string;
  actorUserId: string;
  asAdmin?: boolean; // сверка админом: без проверки владельца
  resultJwt?: unknown; // результат Unified Checkout из браузера — только подсказка
}): Promise<CitResult> {
  const started = Date.now();
  // Диагностика структуры результата Unified Checkout: только имена ключей, без значений.
  if (args.resultJwt !== undefined) {
    const payload = decodeJwtPayload(args.resultJwt);
    console.info(JSON.stringify({ evt: "cs_cit_result_jwt", paymentId: args.paymentId, decoded: payload !== null, keys: jwtKeyPaths(payload) }));
  }
  const payment = await prisma.payment.findUnique({ where: { id: args.paymentId } });
  if (!payment || (!args.asAdmin && payment.userId !== args.actorUserId)) return { status: "not_found" };
  if (payment.provider !== "CYBERSOURCE" || payment.initiator !== "CUSTOMER") return { status: "failed", code: "WRONG_PROVIDER" };
  // Проверка карты (смена карты) завершается в card-change.ts, не здесь.
  if (payment.purpose === "CARD_VERIFICATION") return { status: "failed", code: "WRONG_PURPOSE" };
  if (payment.status === "PAID") return { status: "already_paid" };
  if (payment.status === "FAILED") return { status: "failed", code: payment.declineReason ?? "FAILED" };
  if (!isAttributed(payment)) return { status: "failed", code: "NO_ACCOUNT" };

  const claim = await prisma.payment.updateMany({
    where: { id: payment.id, status: { in: ["PENDING", "UNKNOWN"] }, completionStartedAt: null },
    data: { completionStartedAt: new Date() },
  });
  if (claim.count === 0) return { status: "processing" };
  const release = (status?: "UNKNOWN") =>
    prisma.payment.updateMany({
      where: { id: payment.id, status: { in: ["PENDING", "UNKNOWN"] } },
      data: { completionStartedAt: null, ...(status ? { status } : {}) },
    });

  try {
    const { facts, transient, notIndexed } = await locateTransaction(payment, args.resultJwt);
    if (!facts) {
      await release("UNKNOWN");
      log({ paymentId: payment.id, order: payment.order, result: "unknown", transient, notIndexed, ms: Date.now() - started });
      return { status: "unknown" };
    }

    const check = validateCitCompletion(payment, facts, payment.userId);
    if (!check.ok) {
      // FAILED — окончательный: только явный отказ ics_auth или заполненные, но другие сумма /
      // валюта / reference. Всё прочее (не готово, не оплата) — UNKNOWN и повтор.
      if (!CIT_FINAL_FAILURES.has(check.code)) {
        await release("UNKNOWN");
        log({ paymentId: payment.id, csTransactionId: facts.id, result: "unknown", reason: check.code, ms: Date.now() - started });
        return { status: "unknown" };
      }
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          csTransactionId: facts.id,
          processorCode: facts.processorCode,
          declineReason: check.code === "DECLINED" ? "DECLINED" : `VALIDATION_${check.code}`,
        },
      });
      // Несоответствие суммы/валюты/ссылки при принятой оплате — требует ручного разбора (void/refund).
      if (check.code !== "DECLINED") {
        console.error(JSON.stringify({ evt: "cs_cit_complete", paymentId: payment.id, csTransactionId: facts.id, result: check.code, alert: "CS_CIT_MISMATCH" }));
      } else {
        log({ paymentId: payment.id, csTransactionId: facts.id, result: "declined", ms: Date.now() - started });
      }
      return check.code === "DECLINED" ? { status: "declined" } : { status: "failed", code: check.code };
    }

    const now = new Date();
    // Записи CyberSource (токен, подписка, согласие; при Basic → Pro — закрытие старой подписки)
    // одной транзакцией БД. Повтор после сбоя продолжит с того же места.
    const rec = await recordCitSuccess(payment.id, facts, now);
    if (!facts.customerId || !facts.paymentInstrumentId) {
      // Оплата прошла, но токен не создан — автопродление невозможно; план выдаём за оплаченный период.
      console.warn(JSON.stringify({ evt: "cs_cit_complete", paymentId: payment.id, csTransactionId: facts.id, warn: "NO_TMS_TOKEN" }));
    }
    // Старый токен — только после того, как новая подписка записана (ошибка удаления не откатывает).
    if (rec.retirePaymentMethodId) {
      const r = await retirePaymentMethod({ paymentMethodId: rec.retirePaymentMethodId, paymentId: payment.id, now });
      log({ paymentId: payment.id, replacedSubscriptionId: payment.replacesSubscriptionId, oldToken: r });
    }
    const periodEnd = rec.periodEnd;

    const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (!isAttributed(fresh)) return { status: "failed", code: "NO_ACCOUNT" };
    if (fresh.purpose === "AGENCY_TOPUP") {
      // Места уже выданы в recordCitSuccess (той же транзакцией, что PAID) — только чек.
      const owner = await prisma.user.findUnique({ where: { id: fresh.userId }, select: { email: true, name: true } });
      if (owner && rec.topup) {
        try {
          await sendReceiptEmail(owner.email, {
            order: fresh.order,
            amount: fresh.amount,
            currency: fresh.currency,
            customerName: owner.name,
            agency: rec.topup.agency ? agencyReceiptInfo(fresh, rec.topup.agency) : undefined,
            plan: fresh.plan,
            purpose: fresh.purpose,
            seats: fresh.seats,
            rrn: null,
            approval: facts.approvalCode,
            cardLast4: facts.cardLast4,
            cardNetwork: facts.cardBrand,
            paidAt: now,
          });
        } catch (e) {
          console.error(`${LOG_TAG} receipt email error ORDER=${fresh.order}`, e);
        }
      }
      log({ paymentId: payment.id, csTransactionId: facts.id, result: "paid", topup: rec.topup?.applied ?? false, ms: Date.now() - started });
      return { status: "paid" };
    }
    // Подписка CyberSource — календарный период; места агентства пока прежней логикой (30 дней).
    // Момент начала периода (при повторе — тот же, что у созданной подписки): planActivatedAt.
    const fulfilled = await fulfillPaidPayment(fresh, rec.periodStart, LOG_TAG, { periodEnd });
    if (fresh.purpose === "AGENCY_SEATS" && fresh.subscriptionId) {
      const agency = await prisma.agency.findUnique({ where: { ownerId: fresh.userId }, select: { id: true } });
      if (agency) await prisma.subscription.update({ where: { id: fresh.subscriptionId }, data: { agencyId: agency.id } });
    }

    if (fulfilled.receiptTo) {
      try {
        await sendReceiptEmail(fulfilled.receiptTo, {
          order: fresh.order,
          amount: fresh.amount,
          currency: fresh.currency,
          customerName: fulfilled.receiptName ?? "",
          agency: fulfilled.receiptAgency,
          plan: fresh.plan,
          purpose: fresh.purpose,
          overageFeature: fresh.overageFeature,
          seats: fresh.seats,
          rrn: null,
          approval: facts.approvalCode,
          cardLast4: facts.cardLast4,
          cardNetwork: facts.cardBrand,
          paidAt: now,
        });
      } catch (e) {
        console.error(`${LOG_TAG} receipt email error ORDER=${fresh.order}`, e);
      }
    }
    log({ paymentId: payment.id, csTransactionId: facts.id, result: "paid", ms: Date.now() - started });
    return { status: "paid" };
  } catch (e) {
    await release();
    throw e;
  }
}
