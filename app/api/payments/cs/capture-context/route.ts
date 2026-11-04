import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { generateOrder, paymentCurrency } from "@/lib/payments";
import { isCyberSourceEnabledFor } from "@/lib/payment-provider";
import { resolvePaymentIntent } from "@/lib/payment-intent";
import { AGENCY_TOPUP_CONSENT_VERSION, RECURRING_CONSENT_VERSION } from "@/lib/recurring-consent";
import { hasOwnAgencyCsSubscription } from "@/lib/agency-subscription-service";
import { createCaptureContext } from "@/lib/cybersource/checkout";
import { checkPersonalCheckout, hasOwnCsSubscription } from "@/lib/plan-change-service";

// POST /api/payments/cs/capture-context
//   { purpose, plan?, seats?, takeOwnerSeat?, agreedToTerms, agreedToRecurring, consentVersion }
// → { paymentId, captureContext, clientLibrary, clientLibraryIntegrity, amount, currency }.
// Создаёт Payment (PENDING, CYBERSOURCE, CUSTOMER, payerEmail) и запись согласия (версия текста,
// сумма, ip, user-agent), затем capture context Unified Checkout. Сумма — только сервер.
function clientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0].trim() : request.headers.get("x-real-ip")) || null;
}

export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  const user = await prisma.user.findUnique({ where: { id: sess.userId }, select: { email: true, role: true } });
  if (!user) return NextResponse.json({ error: "Utilizator negăsit." }, { status: 404 });
  // Владелец подписки CyberSource (личной или агентской) может сменить план / докупить места и вне
  // бета-списка (иначе кнопка вела бы в тупик).
  if (!isCyberSourceEnabledFor(user) && !(await hasOwnCsSubscription(sess.userId)) && !(await hasOwnAgencyCsSubscription(sess.userId))) {
    return NextResponse.json({ error: "Plata cu cardul salvat nu este disponibilă." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Cerere invalidă." }, { status: 400 });
  if (body.agreedToTerms !== true || body.agreedToRecurring !== true) {
    return NextResponse.json({ error: "Trebuie să bifați ambele acorduri." }, { status: 400 });
  }
  const expectedVersion = body.purpose === "AGENCY_TOPUP" ? AGENCY_TOPUP_CONSENT_VERSION : RECURRING_CONSENT_VERSION;
  if (body.consentVersion !== expectedVersion) {
    return NextResponse.json({ error: "Textul acordului s-a actualizat. Reîncărcați pagina." }, { status: 409 });
  }

  const resolved = await resolvePaymentIntent(sess.userId, body);
  if (!resolved.ok) return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  const { intent } = resolved;

  // Одна активная подписка на тип. Личная: Basic → Pro — эта оплата заменит текущую подписку
  // (Payment.replacesSubscriptionId, замена — в cit.ts после успеха); тот же план или понижение —
  // отказ (понижение идёт без оплаты, со следующего периода). Агентская — по-прежнему одна.
  let replacesSubscriptionId: string | null = null;
  if (intent.purpose === "SUBSCRIPTION") {
    const pc = await checkPersonalCheckout(sess.userId, intent.plan);
    if (!pc.ok) return NextResponse.json({ error: pc.message }, { status: pc.status });
    replacesSubscriptionId = pc.replacesSubscriptionId;
  } else if (intent.purpose === "AGENCY_SEATS") {
    const active = await prisma.subscription.findFirst({
      where: { userId: sess.userId, kind: "AGENCY", status: { in: ["ACTIVE", "PAST_DUE"] } },
      select: { id: true },
    });
    if (active) return NextResponse.json({ error: "Aveți deja un abonament cu reînnoire automată." }, { status: 409 });
  }

  // Докупка мест: оплата сейчас — пропорция, согласие — на новую месячную сумму; платёж сразу
  // привязан к подписке (выдача мест — в cit.ts, биллинг ждёт её исхода).
  const currency = paymentCurrency();
  const amount = intent.amount.toFixed(2);
  const consentAmount = intent.topup ? intent.topup.monthlyAmount : amount;
  // Сумма докупки считается по дням — на границе суток могла измениться после показа страницы.
  // Клиент дал согласие на показанную сумму, поэтому при расхождении просим обновить страницу.
  if (intent.topup && typeof body.expectedAmount === "string" && body.expectedAmount !== amount) {
    return NextResponse.json({ error: "Suma de plată s-a actualizat. Reîncărcați pagina." }, { status: 409 });
  }
  const payment = await prisma.payment.create({
    data: {
      order: generateOrder(),
      userId: sess.userId,
      payerEmail: user.email,
      plan: intent.plan,
      amount,
      currency,
      purpose: intent.purpose,
      seats: intent.seats,
      ownerTakesSeat: intent.ownerTakesSeat,
      provider: "CYBERSOURCE",
      initiator: "CUSTOMER",
      replacesSubscriptionId,
      subscriptionId: intent.topup?.subscriptionId ?? null,
    },
    select: { id: true, order: true },
  });
  await prisma.recurringConsent.create({
    data: {
      userId: sess.userId,
      paymentId: payment.id,
      textVersion: expectedVersion,
      amount: consentAmount,
      currency,
      ip: clientIp(request),
      userAgent: (request.headers.get("user-agent") ?? "").slice(0, 500) || null,
    },
  });

  const cc = await createCaptureContext({ amount, currency, referenceCode: payment.order });
  if (!cc.ok) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", declineReason: `CAPTURE_CONTEXT_${cc.httpStatus}${cc.reason ? `_${cc.reason}` : ""}`.slice(0, 120) },
    });
    return NextResponse.json({ error: "Plata nu poate fi inițiată acum. Încercați mai târziu." }, { status: 502 });
  }
  return NextResponse.json({
    paymentId: payment.id,
    captureContext: cc.captureContext,
    clientLibrary: cc.clientLibrary,
    clientLibraryIntegrity: cc.clientLibraryIntegrity,
    amount,
    currency,
  });
}
