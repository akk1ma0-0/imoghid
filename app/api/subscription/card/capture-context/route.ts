import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { generateOrder, paymentCurrency } from "@/lib/payments";
import { RECURRING_CONSENT_VERSION } from "@/lib/recurring-consent";
import { findOwnSubscription } from "@/lib/subscription-service";
import { canChangeCard, cooldownLeftMs } from "@/lib/subscription-rules";
import { createCaptureContext } from "@/lib/cybersource/checkout";

// POST /api/subscription/card/capture-context { agreedToRecurring, consentVersion }
// → { paymentId, captureContext, clientLibrary, clientLibraryIntegrity, amount, currency }.
// Смена карты: проверка новой карты на 0.00 (completeMandate.type AUTH, 3DS, токен TMS).
// Payment (purpose CARD_VERIFICATION, 0.00) привязан к подписке владельца; новое согласие на
// автосписание (сумма подписки, версия текста, ip, user-agent) записывается здесь.
const COOLDOWN_MS = 20_000;

function clientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0].trim() : request.headers.get("x-real-ip")) || null;
}

export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || body.agreedToRecurring !== true) {
    return NextResponse.json({ error: "Bifați acordul pentru plata lunară automată." }, { status: 400 });
  }
  if (body.consentVersion !== RECURRING_CONSENT_VERSION) {
    return NextResponse.json({ error: "Textul acordului s-a actualizat. Reîncărcați pagina." }, { status: 409 });
  }
  const sub = await findOwnSubscription(sess.userId);
  if (!sub || !canChangeCard(sub)) {
    return NextResponse.json({ error: "Nu aveți un abonament activ cu reînnoire automată." }, { status: 404 });
  }
  const last = await prisma.payment.findFirst({
    where: { subscriptionId: sub.id, purpose: "CARD_VERIFICATION" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (cooldownLeftMs(last?.createdAt ?? null, COOLDOWN_MS, new Date()) > 0) {
    return NextResponse.json({ error: "Încercați din nou peste câteva secunde." }, { status: 429 });
  }
  const consent = sub.amount
    ? null
    : await prisma.recurringConsent.findFirst({ where: { subscriptionId: sub.id }, orderBy: { acceptedAt: "desc" } });
  const recurringAmount = sub.amount ?? consent?.amount;
  if (!recurringAmount) return NextResponse.json({ error: "Abonamentul nu poate fi actualizat acum. Contactați-ne." }, { status: 409 });
  const currency = sub.currency ?? paymentCurrency();
  const user = await prisma.user.findUnique({ where: { id: sess.userId }, select: { email: true } });

  const payment = await prisma.payment.create({
    data: {
      order: generateOrder(),
      userId: sess.userId,
      payerEmail: user?.email ?? null,
      plan: sub.plan,
      amount: "0.00",
      currency,
      purpose: "CARD_VERIFICATION",
      provider: "CYBERSOURCE",
      initiator: "CUSTOMER",
      subscriptionId: sub.id,
    },
    select: { id: true, order: true },
  });
  await prisma.recurringConsent.create({
    data: {
      userId: sess.userId,
      subscriptionId: sub.id,
      paymentId: payment.id,
      textVersion: RECURRING_CONSENT_VERSION,
      amount: recurringAmount,
      currency,
      ip: clientIp(request),
      userAgent: (request.headers.get("user-agent") ?? "").slice(0, 500) || null,
    },
  });

  const cc = await createCaptureContext({ amount: "0.00", currency, referenceCode: payment.order, type: "AUTH" });
  if (!cc.ok) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", declineReason: `CAPTURE_CONTEXT_${cc.httpStatus}`.slice(0, 120) } });
    return NextResponse.json({ error: "Actualizarea cardului nu poate fi inițiată acum. Încercați mai târziu." }, { status: 502 });
  }
  return NextResponse.json({
    paymentId: payment.id,
    captureContext: cc.captureContext,
    clientLibrary: cc.clientLibrary,
    clientLibraryIntegrity: cc.clientLibraryIntegrity,
    amount: recurringAmount,
    currency,
  });
}
