import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { psignVerifyCallback, vbCompletion } from "@/lib/vb-egateway";

// POST /api/payments/vb-callback — авторитетный server-to-server callback банка.
// Всегда отвечаем HTTP 200 (иначе банк ретраит), даже при невалидной подписи.
// Поля callback'а (ACTION/RC/RRN/…), проверка P_SIGN по victoria_pub.pem.
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

  const payment = await prisma.payment.findUnique({ where: { order: ORDER } });
  if (!payment) {
    console.error("[VB callback] unknown ORDER:", ORDER);
    return new NextResponse("OK", { status: 200 });
  }
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
    // Авторизация успешна → сохранить RRN/INT_REF и захватить средства (TRTYPE=21).
    await prisma.payment.update({
      where: { id: payment.id },
      data: { rrn: RRN || null, intRef: INT_REF || null, rc: RC, action: ACTION },
    });

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
      // Завершение успешно → активируем план пользователя на 30 дней.
      // Автопродление/повторное списание НЕ реализуем (ждём ответа банка по recurring);
      // по истечении planExpiresAt cron обнулит план (см. /api/cron/check-expired-plans).
      const now = new Date();
      const planExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await prisma.$transaction([
        prisma.payment.update({ where: { id: payment.id }, data: { status: "PAID", rc: "00" } }),
        prisma.user.update({
          where: { id: payment.userId },
          data: { plan: payment.plan, planActivatedAt: now, planExpiresAt },
        }),
      ]);
      console.log(`[VB callback] PAID ORDER=${ORDER} plan=${payment.plan} user=${payment.userId}`);
    } else {
      console.error(`[VB callback] capture failed ORDER=${ORDER} RC=${captureRc}`);
      // Оставляем PENDING (авторизация есть, захват не прошёл) — разбор вручную.
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
