// Смена карты подписки CyberSource: проверка новой карты на 0.00 (Account Verification) через
// Unified Checkout (completeMandate.type = AUTH, 3DS, создание токена TMS), затем переключение.
//
// Порядок (идемпотентно, как cit.ts):
//   1) Payment (purpose CARD_VERIFICATION) принадлежит пользователю; PAID → уже сделано;
//   2) атомарный клейм completionStartedAt;
//   3) транзакцию проверки ищем сами (locateTransaction: только ics_auth/ics_bill, 3DS-транзакции
//      под тем же reference code пропускаются; не проиндексировано → UNKNOWN и повтор);
//   4) validateCardVerification: FAILED только при явном отказе или заполненных, но других полях;
//   5) новый PaymentMethod → subscription.paymentMethodId (и NTI новой карты для MIT) → согласие;
//      ТОЛЬКО ПОСЛЕ этого старый токен удаляется в CyberSource и старый PaymentMethod → REMOVED.
import { prisma } from "@/lib/prisma";
import { locateTransaction } from "@/lib/cybersource/cit";
import { CIT_FINAL_FAILURES, validateCardVerification } from "@/lib/cybersource/cit-validation";
import { deleteCustomer, deletePaymentInstrument } from "@/lib/cybersource/tms";

export type CardChangeResult =
  | { status: "updated" }
  | { status: "already_done" }
  | { status: "processing" }
  | { status: "unknown" }
  | { status: "declined" }
  | { status: "failed"; code: string }
  | { status: "not_found" };

function log(line: Record<string, unknown>, level: "info" | "error" = "info") {
  const s = JSON.stringify({ evt: "cs_card_change", ...line });
  if (level === "error") console.error(s);
  else console.info(s);
}

export async function completeCardChange(args: { paymentId: string; userId: string; resultJwt?: unknown }): Promise<CardChangeResult> {
  const started = Date.now();
  const payment = await prisma.payment.findUnique({ where: { id: args.paymentId } });
  if (!payment || payment.userId !== args.userId || payment.purpose !== "CARD_VERIFICATION") return { status: "not_found" };
  if (payment.status === "PAID") return { status: "already_done" };
  if (payment.status === "FAILED") return { status: "failed", code: payment.declineReason ?? "FAILED" };
  if (!payment.subscriptionId) return { status: "failed", code: "NO_SUBSCRIPTION" };

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
      log({ paymentId: payment.id, result: "unknown", transient, notIndexed, ms: Date.now() - started });
      return { status: "unknown" };
    }
    const check = validateCardVerification(payment, facts, args.userId);
    if (!check.ok) {
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
      log({ paymentId: payment.id, csTransactionId: facts.id, result: check.code, ...(check.code !== "DECLINED" ? { alert: "CS_CARD_MISMATCH" } : {}) }, check.code === "DECLINED" ? "info" : "error");
      return check.code === "DECLINED" ? { status: "declined" } : { status: "failed", code: check.code };
    }

    const now = new Date();
    const subscriptionId = payment.subscriptionId;
    // Переключение в одной транзакции БД: новый токен → подписка → согласие → платёж PAID.
    const oldPm = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId }, include: { paymentMethod: true } });
      const pm = await tx.paymentMethod.upsert({
        where: { tmsPaymentInstrumentId: facts.paymentInstrumentId! },
        create: {
          userId: args.userId,
          tmsCustomerId: facts.customerId!,
          tmsPaymentInstrumentId: facts.paymentInstrumentId!,
          cardLast4: facts.cardLast4,
          cardBrand: facts.cardBrand,
          expMonth: facts.expMonth,
          expYear: facts.expYear,
        },
        update: { status: "ACTIVE", removedAt: null, cardLast4: facts.cardLast4, cardBrand: facts.cardBrand, expMonth: facts.expMonth, expYear: facts.expYear },
      });
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          paymentMethodId: pm.id,
          // Следующие MIT ссылаются на первую транзакцию НОВОЙ карты (stored credential).
          ...(facts.networkTransactionId ? { initialNetworkTransactionId: facts.networkTransactionId } : {}),
        },
      });
      await tx.recurringConsent.updateMany({ where: { paymentId: payment.id }, data: { subscriptionId } });
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "PAID",
          csTransactionId: facts.id,
          networkTransactionId: facts.networkTransactionId,
          processorCode: facts.processorCode,
          approval: facts.approvalCode,
          cardLast4: facts.cardLast4,
        },
      });
      const prev = sub.paymentMethod;
      return prev && prev.id !== pm.id && prev.status === "ACTIVE" ? prev : null;
    });

    // Старый токен — только после успешного переключения. Ошибка удаления не откатывает смену.
    // Другой TMS customer → удаляем старого customer целиком; тот же customer (новая карта в нём) →
    // только старый payment instrument, иначе удалился бы и новый.
    if (oldPm) {
      const del =
        oldPm.tmsCustomerId !== facts.customerId
          ? await deleteCustomer(oldPm.tmsCustomerId)
          : await deletePaymentInstrument(oldPm.tmsCustomerId, oldPm.tmsPaymentInstrumentId);
      await prisma.paymentOperation.create({
        data: { paymentId: payment.id, type: "TOKEN_DELETE", outcome: del.ok ? (del.alreadyGone ? "already_gone" : "deleted") : "error", httpStatus: del.ok ? (del.alreadyGone ? 404 : 204) : del.httpStatus, actorUserId: args.userId },
      });
      if (del.ok) await prisma.paymentMethod.update({ where: { id: oldPm.id }, data: { status: "REMOVED", removedAt: now } });
      else log({ paymentId: payment.id, alert: "CS_OLD_TOKEN_DELETE_FAILED", httpStatus: del.httpStatus }, "error");
    }

    log({ paymentId: payment.id, csTransactionId: facts.id, result: "updated", ms: Date.now() - started });
    return { status: "updated" };
  } catch (e) {
    await release();
    throw e;
  }
}
