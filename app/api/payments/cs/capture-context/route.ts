import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { generateOrder, paymentCurrency } from "@/lib/payments";
import { isCyberSourceEnabledFor } from "@/lib/payment-provider";
import { resolvePaymentIntent } from "@/lib/payment-intent";
import { RECURRING_CONSENT_VERSION } from "@/lib/recurring-consent";
import { createCaptureContext } from "@/lib/cybersource/checkout";

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
  if (!isCyberSourceEnabledFor(user)) return NextResponse.json({ error: "Plata cu cardul salvat nu este disponibilă." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Cerere invalidă." }, { status: 400 });
  if (body.agreedToTerms !== true || body.agreedToRecurring !== true) {
    return NextResponse.json({ error: "Trebuie să bifați ambele acorduri." }, { status: 400 });
  }
  if (body.consentVersion !== RECURRING_CONSENT_VERSION) {
    return NextResponse.json({ error: "Textul acordului s-a actualizat. Reîncărcați pagina." }, { status: 409 });
  }

  const resolved = await resolvePaymentIntent(sess.userId, body);
  if (!resolved.ok) return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  const { intent } = resolved;

  // Одна активная подписка на тип (смена плана с автопродлением — следующий шаг).
  const active = await prisma.subscription.findFirst({
    where: { userId: sess.userId, kind: intent.purpose === "AGENCY_SEATS" ? "AGENCY" : "PERSONAL", status: { in: ["ACTIVE", "PAST_DUE"] } },
    select: { id: true },
  });
  if (active) return NextResponse.json({ error: "Aveți deja un abonament cu reînnoire automată." }, { status: 409 });

  const currency = paymentCurrency();
  const amount = intent.amount.toFixed(2);
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
    },
    select: { id: true, order: true },
  });
  await prisma.recurringConsent.create({
    data: {
      userId: sess.userId,
      paymentId: payment.id,
      textVersion: RECURRING_CONSENT_VERSION,
      amount,
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
