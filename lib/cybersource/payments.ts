// CyberSource: платежи по сохранённому токену TMS и последующие операции (void/refund/capture/
// reversal). Платёжный путь приложения этот модуль пока НЕ использует (подключение — следующие шаги).
//
// Поля сверены с developer.cybersource.com (ctv):
//   MIT recurring с TMS — POST /pts/v2/payments: orderInformation.amountDetails.{totalAmount,currency},
//     paymentInformation.customer.id | paymentInstrument.id, processingInformation.commerceIndicator=recurring;
//   initiator (type=merchant, storedCredentialUsed, merchantInitiatedTransaction.previousTransactionId) —
//     processingInformation.authorizationOptions.initiator.*;
//   void — POST /pts/v2/payments/{id}/voids; refund — POST /pts/v2/payments/{id}/refunds;
//   capture — POST /pts/v2/payments/{id}/captures; reversal — POST /pts/v2/payments/{id}/reversals.
import { Prisma, type SubscriptionPlan } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { generateOrder, paymentCurrency } from "@/lib/payments";
import { csRequest, CsTransportError, safePathId } from "@/lib/cybersource/client";
import { classifyResponse, OK_STATUSES, type CsOutcome } from "@/lib/cybersource/responses";

// Минимальная сумма транзакции по контракту банка.
export const MIN_AMOUNT_MDL = 10;

const money = (amount: number) => amount.toFixed(2);

function assertAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Сумма должна быть положительной");
  if (paymentCurrency() === "MDL" && amount < MIN_AMOUNT_MDL) {
    throw new Error(`Сумма меньше минимальной (${MIN_AMOUNT_MDL} MDL)`);
  }
}

// Сетевой сбой/таймаут → исход неизвестен (не повторять без сверки).
async function send(op: string, path: string, body: unknown, ok: readonly string[]): Promise<CsOutcome> {
  try {
    return classifyResponse(await csRequest({ op, method: "POST", path, body }), ok);
  } catch (e) {
    if (e instanceof CsTransportError) return { kind: "unknown", httpStatus: 0, status: e.kind };
    throw e;
  }
}

export type MitChargeInput = {
  userId: string;
  payerEmail: string | null;
  plan: SubscriptionPlan;
  // Ключ идемпотентности (уникален в БД): одна попытка attemptNo за период подписки.
  subscriptionId: string;
  periodStart: Date;
  attemptNo: number;
  amount: number; // в PAYMENT_CURRENCY (MDL)
  customerId: string; // TMS customer
  paymentInstrumentId?: string; // TMS paymentInstrument (если не дефолтный у customer)
  previousTransactionId?: string; // networkTransactionId первого платежа (CIT)
};

export type MitChargeResult =
  // Попытка с этим ключом уже была — запрос в CyberSource НЕ отправлялся.
  | { kind: "duplicate"; paymentId: string; status: string }
  | { kind: "sent"; paymentId: string; order: string; outcome: CsOutcome };

// Списание без участия клиента (MIT) по сохранённому токену.
// Идемпотентность — наша: строка Payment с unique(subscriptionId, periodStart, attemptNo)
// создаётся ДО вызова API; конкурентный/повторный вызов получает P2002 и ничего не шлёт.
// clientReferenceInformation.code = Payment.order (ссылка для сверки, не дедупликация).
export async function chargeSavedCard(input: MitChargeInput): Promise<MitChargeResult> {
  assertAmount(input.amount);
  const claim = await claimChargeAttempt(input);
  if (claim.kind === "duplicate") return claim;
  const { payment, amount, currency } = claim;
  return sendCharge(input, payment, amount, currency);
}

// Шаг 1 — «клейм» попытки: строка Payment с уникальным ключом (subscriptionId, periodStart,
// attemptNo) создаётся ДО вызова API. Параллельный/повторный запуск получает P2002 → duplicate.
export async function claimChargeAttempt(
  input: MitChargeInput,
): Promise<
  | { kind: "duplicate"; paymentId: string; status: string }
  | { kind: "claimed"; payment: { id: string; order: string }; amount: string; currency: string }
> {
  const currency = paymentCurrency();
  const amount = money(input.amount);
  let payment: { id: string; order: string };
  try {
    payment = await prisma.payment.create({
      data: {
        order: generateOrder(),
        userId: input.userId,
        payerEmail: input.payerEmail,
        plan: input.plan,
        amount,
        currency,
        purpose: "SUBSCRIPTION",
        provider: "CYBERSOURCE",
        initiator: "MERCHANT",
        subscriptionId: input.subscriptionId,
        periodStart: input.periodStart,
        attemptNo: input.attemptNo,
      },
      select: { id: true, order: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.payment.findFirst({
        where: { subscriptionId: input.subscriptionId, periodStart: input.periodStart, attemptNo: input.attemptNo },
        select: { id: true, status: true },
      });
      if (existing) return { kind: "duplicate", paymentId: existing.id, status: existing.status };
    }
    throw e;
  }
  return { kind: "claimed", payment, amount, currency };
}

// Шаг 2 — запрос в CyberSource и запись исхода в ту же строку Payment.
async function sendCharge(
  input: MitChargeInput,
  payment: { id: string; order: string },
  amount: string,
  currency: string,
): Promise<MitChargeResult> {
  const outcome = await send(
    "mit_charge",
    "/pts/v2/payments",
    {
      clientReferenceInformation: { code: payment.order },
      processingInformation: {
        capture: true, // продажа: авторизация + списание
        commerceIndicator: "recurring",
        authorizationOptions: {
          initiator: {
            type: "merchant",
            storedCredentialUsed: true,
            ...(input.previousTransactionId
              ? { merchantInitiatedTransaction: { previousTransactionId: input.previousTransactionId } }
              : {}),
          },
        },
      },
      paymentInformation: {
        customer: { id: input.customerId },
        ...(input.paymentInstrumentId ? { paymentInstrument: { id: input.paymentInstrumentId } } : {}),
      },
      orderInformation: { amountDetails: { totalAmount: amount, currency } },
    },
    OK_STATUSES.payment,
  );

  await prisma.payment.update({ where: { id: payment.id }, data: paymentUpdateFor(outcome) });
  return { kind: "sent", paymentId: payment.id, order: payment.order, outcome };
}

// Что записать в Payment по исходу. PAID/FAILED — исход известен; UNKNOWN — ждёт сверки;
// review (частичная авторизация / ревью) остаётся PENDING для ручного разбора.
export function paymentUpdateFor(outcome: CsOutcome): Prisma.PaymentUpdateInput {
  switch (outcome.kind) {
    case "approved":
      return {
        status: "PAID",
        csTransactionId: outcome.requestId,
        networkTransactionId: outcome.details.networkTransactionId,
        processorCode: outcome.details.processorCode,
        approval: outcome.details.approvalCode,
      };
    case "declined":
      return {
        status: "FAILED",
        csTransactionId: outcome.requestId,
        declineReason: outcome.details.reason ?? outcome.status,
        processorCode: outcome.details.processorCode,
      };
    case "review":
      return { status: "PENDING", csTransactionId: outcome.requestId, declineReason: outcome.status };
    case "invalid":
      return { status: "FAILED", declineReason: outcome.reason ?? outcome.status ?? "INVALID_REQUEST" };
    case "auth_error":
      return { status: "FAILED", declineReason: `AUTH_${outcome.httpStatus}` };
    case "not_found":
      return { status: "FAILED", declineReason: "NOT_FOUND" };
    case "unknown":
      return { status: "UNKNOWN", declineReason: outcome.status ?? `HTTP_${outcome.httpStatus}` };
  }
}

// ── Последующие операции по id транзакции CyberSource. Идемпотентность возвратов/отмен
// (запись в БД до вызова) — задача вызывающего; здесь только вызов и разбор ответа.

export async function voidTransaction(transactionId: string, referenceCode: string): Promise<CsOutcome> {
  return send(
    "void",
    `/pts/v2/payments/${safePathId(transactionId)}/voids`,
    { clientReferenceInformation: { code: referenceCode } },
    OK_STATUSES.void,
  );
}

export async function refundPayment(transactionId: string, amount: number, referenceCode: string): Promise<CsOutcome> {
  assertAmount(amount);
  return send(
    "refund",
    `/pts/v2/payments/${safePathId(transactionId)}/refunds`,
    {
      clientReferenceInformation: { code: referenceCode },
      orderInformation: { amountDetails: { totalAmount: money(amount), currency: paymentCurrency() } },
    },
    OK_STATUSES.refund,
  );
}

// Нужно только для авторизаций без capture (наши списания идут с capture: true).
export async function capturePayment(transactionId: string, amount: number, referenceCode: string): Promise<CsOutcome> {
  assertAmount(amount);
  return send(
    "capture",
    `/pts/v2/payments/${safePathId(transactionId)}/captures`,
    {
      clientReferenceInformation: { code: referenceCode },
      orderInformation: { amountDetails: { totalAmount: money(amount), currency: paymentCurrency() } },
    },
    OK_STATUSES.capture,
  );
}

// Отмена авторизации (сумма = сумме авторизации). Для Account Verification 0.00 не нужна.
export async function reverseAuthorization(transactionId: string, amount: number, referenceCode: string): Promise<CsOutcome> {
  return send(
    "reversal",
    `/pts/v2/payments/${safePathId(transactionId)}/reversals`,
    {
      clientReferenceInformation: { code: referenceCode },
      reversalInformation: { amountDetails: { totalAmount: money(amount), currency: paymentCurrency() } },
    },
    OK_STATUSES.reversal,
  );
}
