// Завершение первой оплаты клиента (CIT) через Unified Checkout.
//
// Порядок (идемпотентно, как callback VictoriaBank):
//   1) Payment принадлежит пользователю, провайдер CYBERSOURCE/CUSTOMER; PAID → ничего не делаем;
//   2) атомарный клейм completionStartedAt (параллельный/повторный вызов выходит сразу);
//   3) транзакцию ищем САМИ у CyberSource: кандидаты id из присланного JWT → детали
//      (GET /tss/v2/transactions/{id}); нет — поиск по нашему reference code (search.ts);
//   4) проверка суммы/валюты/статуса/reference (cit-validation.ts);
//   5) PaymentMethod + Subscription + привязка RecurringConsent (одна транзакция БД),
//      затем fulfillPaidPayment (план / места) и чек.
// Неясный исход (сеть, 5xx, транзакция ещё не найдена, статус не финальный) → UNKNOWN,
// клейм снимается — повторный вызов/сверка продолжит с того же места.
import type { Payment } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { fulfillPaidPayment, isAttributed } from "@/lib/billing";
import { sendReceiptEmail } from "@/lib/email";
import { getTransactionDetails } from "@/lib/cybersource/checkout";
import { findByReferenceCode } from "@/lib/cybersource/search";
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
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // как fulfillSubscription / creditAgencySeats

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
async function locateTransaction(
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
    // Записи CyberSource: токены карты, подписка, согласие. Идемпотентно: при повторе после сбоя
    // PaymentMethod находится по unique tmsPaymentInstrumentId, подписка — по payment.subscriptionId.
    await prisma.$transaction(async (tx) => {
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
      if (!payment.subscriptionId && facts.customerId && facts.paymentInstrumentId) {
        const card = {
          cardLast4: facts.cardLast4,
          cardBrand: facts.cardBrand,
          expMonth: facts.expMonth,
          expYear: facts.expYear,
        };
        const pm = await tx.paymentMethod.upsert({
          where: { tmsPaymentInstrumentId: facts.paymentInstrumentId },
          create: {
            userId: payment.userId,
            tmsCustomerId: facts.customerId,
            tmsPaymentInstrumentId: facts.paymentInstrumentId,
            ...card,
          },
          update: { ...card, status: "ACTIVE", removedAt: null },
        });
        const sub = await tx.subscription.create({
          data: {
            userId: payment.userId,
            kind: payment.purpose === "AGENCY_SEATS" ? "AGENCY" : "PERSONAL",
            plan: payment.plan,
            status: "ACTIVE",
            provider: "CYBERSOURCE",
            paymentMethodId: pm.id,
            initialNetworkTransactionId: facts.networkTransactionId,
            currentPeriodStart: now,
            currentPeriodEnd: new Date(now.getTime() + PERIOD_MS),
            nextChargeAt: new Date(now.getTime() + PERIOD_MS),
          },
        });
        await tx.payment.update({ where: { id: payment.id }, data: { subscriptionId: sub.id } });
        await tx.recurringConsent.updateMany({ where: { paymentId: payment.id }, data: { subscriptionId: sub.id } });
      }
    });
    if (!facts.customerId || !facts.paymentInstrumentId) {
      // Оплата прошла, но токен не создан — автопродление невозможно; план выдаём за оплаченный период.
      console.warn(JSON.stringify({ evt: "cs_cit_complete", paymentId: payment.id, csTransactionId: facts.id, warn: "NO_TMS_TOKEN" }));
    }

    const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (!isAttributed(fresh)) return { status: "failed", code: "NO_ACCOUNT" };
    const fulfilled = await fulfillPaidPayment(fresh, now, LOG_TAG);
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
