import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { psignVerifyCallback, vbCompletion } from "@/lib/vb-egateway";
import { sendReceiptEmail } from "@/lib/email";
import { creditAgencySeats } from "@/lib/agency";

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
      let receiptTo: string | null = null;

      if (payment.purpose === "OVERAGE") {
        // Разовая доплата sobre-limit — план НЕ активируем. Payment → PAID делает «грант»
        // активным (overageConsumedAt=null); он потратится при следующем over-limit
        // действии по фиче (lib/usage.ts). Это и закрывает money leak: до PAID гранта нет.
        const paidUser = await prisma.user.findUnique({
          where: { id: payment.userId },
          select: { email: true },
        });
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "PAID", rc: "00" },
        });
        receiptTo = paidUser?.email ?? null;
        console.log(
          `[VB callback] PAID OVERAGE ORDER=${ORDER} feature=${payment.overageFeature} user=${payment.userId}`,
        );
      } else if (payment.purpose === "SINGLE_ACCESS") {
        // «O accesare» — план НЕ активируем. Payment → PAID + создаём 3 одноразовых гранта
        // (по 1 на CADASTRU_CHECK / DOSAR_ANALYSIS / OBIECTE_CREATE). До PAID грантов нет →
        // брошенная оплата ничего не выдаёт (нет money leak). Клейм completionStartedAt
        // гарантирует, что эта ветка отработает ровно один раз (без дублей грантов).
        const paidUser = await prisma.user.findUnique({
          where: { id: payment.userId },
          select: { email: true },
        });
        await prisma.$transaction([
          prisma.payment.update({ where: { id: payment.id }, data: { status: "PAID", rc: "00" } }),
          prisma.singleAccessGrant.createMany({
            data: (["CADASTRU_CHECK", "DOSAR_ANALYSIS", "OBIECTE_CREATE"] as const).map(
              (feature) => ({ userId: payment.userId, feature, paymentId: payment.id }),
            ),
          }),
        ]);
        receiptTo = paidUser?.email ?? null;
        console.log(
          `[VB callback] PAID SINGLE_ACCESS ORDER=${ORDER} user=${payment.userId} (3 grants)`,
        );
      } else if (payment.purpose === "AGENCY_SEATS") {
        // HUB/Agenție — покупка мест. Создаём/продлеваем агентство владельца (seatsPaid += N,
        // planExpiresAt = now+30д). Личные планы участников НЕ трогаем — раздача мест в
        // Чекпоинте 2. Клейм completionStartedAt гарантирует однократность (без двойного зачёта).
        const paidUser = await prisma.user.findUnique({
          where: { id: payment.userId },
          select: { email: true },
        });
        await prisma.$transaction([
          prisma.payment.update({ where: { id: payment.id }, data: { status: "PAID", rc: "00" } }),
        ]);
        const agency = await creditAgencySeats(payment.userId, payment.seats ?? 0);
        receiptTo = paidUser?.email ?? null;
        console.log(
          `[VB callback] PAID AGENCY_SEATS ORDER=${ORDER} owner=${payment.userId} +${payment.seats} → seatsPaid=${agency.seatsPaid}`,
        );
      } else {
        // Подписка → активируем план на 30 дней.
        // Автопродление/повторное списание НЕ реализуем (ждём ответа банка по recurring);
        // по истечении planExpiresAt cron обнулит план (см. /api/cron/check-expired-plans).
        const planExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const [, paidUser] = await prisma.$transaction([
          prisma.payment.update({ where: { id: payment.id }, data: { status: "PAID", rc: "00" } }),
          prisma.user.update({
            where: { id: payment.userId },
            data: { plan: payment.plan, planActivatedAt: now, planExpiresAt },
          }),
        ]);
        receiptTo = paidUser?.email ?? null;
        console.log(`[VB callback] PAID ORDER=${ORDER} plan=${payment.plan} user=${payment.userId}`);
      }

      // Bon electronic — чек на e-mail пользователя. Non-blocking: сбой почты НЕ должен
      // ломать обработку платежа (callback обязан вернуть 200). Поля carte/approval —
      // из локальных переменных этого же TRTYPE=0 (в БД они тоже сохранены клеймом).
      if (receiptTo) {
        try {
          await sendReceiptEmail(receiptTo, {
            order: ORDER,
            amount: payment.amount,
            currency: CURRENCY || payment.currency,
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
