import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { psignVerifyCallback, vbCompletion } from "@/lib/vb-egateway";
import { sendReceiptEmail } from "@/lib/email";
import { fulfillPaidPayment, isAttributed, type FulfillmentResult } from "@/lib/billing";

// POST /api/payments/vb-callback — авторитетный server-to-server callback банка.
// Всегда отвечаем HTTP 200 (иначе банк ретраит), даже при невалидной подписи.
// Поля callback'а (ACTION/RC/RRN/…), проверка P_SIGN по victoria_pub.pem.
const LOG_TAG = "[VB callback]";
const ALLOWED = [
  "ORDER", "TERMINAL", "ACTION", "RC", "TEXT", "APPROVAL", "RRN", "INT_REF",
  "TIMESTAMP", "NONCE", "P_SIGN", "AMOUNT", "CURRENCY", "TRTYPE", "BIN", "CARD", "AUTH", "ECI",
];

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const data: Record<string, string> = {};
  if (form) {
    for (const k of ALLOWED) data[k] = String(form.get(k) ?? "").trim();
  }

  // 1) Проверка подписи. Невалидная → логируем и НЕ обрабатываем (но 200).
  if (!psignVerifyCallback(data)) {
    console.error("[VB callback] P_SIGN FAILED, ORDER:", data.ORDER || "(none)");
    return new NextResponse("OK", { status: 200 });
  }

  const { ACTION, RC, ORDER, RRN, INT_REF, AMOUNT, CURRENCY } = data;

  const found = await prisma.payment.findUnique({ where: { order: ORDER } });
  if (!found) {
    console.error("[VB callback] unknown ORDER:", ORDER);
    return new NextResponse("OK", { status: 200 });
  }
  // Аккаунт удалён (платёж хранится с userId = null) — выдавать некому, захват не делаем.
  if (!isAttributed(found)) {
    console.error("[VB callback] payment without account (user deleted), ORDER:", ORDER);
    return new NextResponse("OK", { status: 200 });
  }
  const payment = found;
  // Идемпотентность: уже оплачено — ничего не делаем.
  if (payment.status === "PAID") {
    return new NextResponse("OK", { status: 200 });
  }

  // Сверяем сумму из callback с тем, что мы инициировали (защита от подмены).
  if (AMOUNT && payment.amount && AMOUNT !== payment.amount) {
    console.error(`[VB callback] AMOUNT mismatch ORDER=${ORDER}: cb=${AMOUNT} db=${payment.amount}`);
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", rc: RC, action: ACTION, rrn: RRN || null, intRef: INT_REF || null },
    });
    return new NextResponse("OK", { status: 200 });
  }

  if (ACTION === "0" && RC === "00") {
    // Данные для bon electronic приходят ИМЕННО в callback авторизации (TRTYPE=0):
    // CARD (маскированный PAN) и APPROVAL. В TRTYPE=21 они уже пустые — сохраняем здесь.
    const approval = data.APPROVAL || null;
    const cardLast4 =
      data.CARD && data.CARD.length >= 4 ? data.CARD.slice(-4) : null;
    // Платёжная сеть по первой цифре PAN (4 = Visa; 2/5 = Mastercard).
    const firstDigit = data.CARD?.[0];
    const cardNetwork =
      firstDigit === "4"
        ? "Visa"
        : firstDigit === "5" || firstDigit === "2"
          ? "Mastercard"
          : null;

    // Пропуск авто-TRTYPE=21 для КОНКРЕТНОГО тестового платежа (Testul 2 = чистый 0→24).
    // Флаг на самой записи Payment (проставлен при инициации из admin-панели) — детерминирован,
    // не зависит от env/раскатки. Обычные платежи (skipAutoCompletion=false) не затрагиваются.
    if (payment.skipAutoCompletion) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          rrn: RRN || null,
          intRef: INT_REF || null,
          rc: RC,
          action: ACTION,
          approval,
          cardLast4,
        },
      });
      console.log(`[VB callback] AUTHORIZED (skip auto-21, per-Payment TEST) ORDER=${ORDER} RRN=${RRN}`);
      return new NextResponse("OK", { status: 200 });
    }

    // Идемпотентный АТОМАРНЫЙ клейм: только ОДИН callback переводит completionStartedAt
    // null → now() (updateMany = один UPDATE с блокировкой строки в БД). Банк ретраит
    // callback при медленном/повторном ответе — без этого параллельные/повторные вызовы
    // дублировали бы TRTYPE=21 (баг «finalizată de 2 ori»). Проигравшие → 200 без 21.
    const claim = await prisma.payment.updateMany({
      where: { id: payment.id, status: "PENDING", completionStartedAt: null },
      data: {
        completionStartedAt: new Date(),
        rrn: RRN || null,
        intRef: INT_REF || null,
        rc: RC,
        action: ACTION,
        approval,
        cardLast4,
      },
    });
    if (claim.count === 0) {
      // Другой callback уже начал/завершил обработку этого ORDER → не дублируем завершение.
      console.log(`[VB callback] duplicate/late callback ignored ORDER=${ORDER}`);
      return new NextResponse("OK", { status: 200 });
    }

    let captureRc = "";
    try {
      const result = await vbCompletion({
        order: ORDER,
        amount: payment.amount,
        currency: CURRENCY || payment.currency,
        rrn: RRN,
        intRef: INT_REF,
      });
      captureRc = result.RC ?? "";
    } catch (e) {
      console.error("[VB callback] TRTYPE=21 error ORDER=" + ORDER, e);
    }

    if (captureRc === "00") {
      const now = new Date();
      // Выдача оплаченного (план / места / гранты) — общий код lib/billing.ts.
      let fulfilled: FulfillmentResult;
      try {
        fulfilled = await fulfillPaidPayment(payment, now, LOG_TAG);
      } catch (e) {
        // Прочие назначения, как и раньше, не перехватываем (ошибка → 500, банк ретраит).
        if (payment.purpose !== "AGENCY_SEATS") throw e;
        // Сбой активации мест (напр. БД): транзакция откатилась целиком → status остался PENDING,
        // агентство НЕ создано (без рассинхрона). Сбрасываем клейм (completionStartedAt=null),
        // чтобы ретрай банка ЗАНОВО прошёл клейм и повторил активацию, а не завис. Средства
        // уже захвачены (TRTYPE=21); при ретрае повторный capture может вернуть «уже завершено»
        // (у TRTYPE=21 нет идемпотентного RC) — тогда останется ручной разбор.
        console.error("[VB callback] AGENCY_SEATS activation failed ORDER=" + ORDER, e);
        await prisma.payment.updateMany({
          where: { id: payment.id, status: "PENDING" },
          data: { completionStartedAt: null },
        });
        return new NextResponse("OK", { status: 200 });
      }
      const { receiptTo, receiptName, receiptAgency } = fulfilled;

      // Bon electronic — чек на e-mail пользователя. Non-blocking: сбой почты НЕ должен
      // ломать обработку платежа (callback обязан вернуть 200). Поля carte/approval —
      // из локальных переменных этого же TRTYPE=0 (в БД они тоже сохранены клеймом).
      if (receiptTo) {
        try {
          await sendReceiptEmail(receiptTo, {
            order: ORDER,
            amount: payment.amount,
            currency: CURRENCY || payment.currency,
            customerName: receiptName ?? "",
            agency: receiptAgency,
            plan: payment.plan,
            purpose: payment.purpose,
            overageFeature: payment.overageFeature,
            seats: payment.seats,
            rrn: RRN || null,
            approval,
            cardLast4,
            cardNetwork,
            paidAt: now,
          });
        } catch (e) {
          console.error("[VB callback] receipt email error ORDER=" + ORDER, e);
        }
      }
    } else {
      console.error(`[VB callback] capture failed ORDER=${ORDER} RC=${captureRc}`);
      // Оставляем PENDING, но completionStartedAt уже проставлен (клейм) → повторные
      // callback'и НЕ будут повторять TRTYPE=21. Разбор вручную (могла быть и таймаут-ошибка
      // при фактически успешном захвате — поэтому автоповтор намеренно не делаем).
    }
  } else {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", rc: RC, action: ACTION },
    });
    console.error(`[VB callback] declined ORDER=${ORDER} ACTION=${ACTION} RC=${RC}`);
  }

  return new NextResponse("OK", { status: 200 });
}
