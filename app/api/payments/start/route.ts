import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { isCyberSourceEnabledFor } from "@/lib/payment-provider";
import { hasOwnCsSubscription } from "@/lib/plan-change-service";
import { POST as vbInitiate } from "@/app/api/payments/vb-initiate/route";
import { POST as vbAgencyInitiate } from "@/app/api/payments/vb-agency-initiate/route";

// POST /api/payments/start — единая точка входа кнопок оплаты подписки и мест агентства.
//   purpose=SUBSCRIPTION (plan) | AGENCY_SEATS (seats, takeOwnerSeat) + agreedToTerms.
// CyberSource (PAYMENT_PROVIDER=cybersource и пользователь в CS_BETA_EMAILS или ADMIN) →
// 303 на /app/checkout. Иначе — прежний поток VictoriaBank: форма передаётся как есть в
// существующие обработчики vb-initiate / vb-agency-initiate (их код не меняется).
// Докупка мест к существующему агентству на этом шаге всегда идёт через VictoriaBank.
export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Cerere invalidă." }, { status: 400 });
  const purpose = String(form.get("purpose") ?? "");
  if (purpose !== "SUBSCRIPTION" && purpose !== "AGENCY_SEATS") {
    return NextResponse.json({ error: "Tip de plată invalid." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: sess.userId }, select: { email: true, role: true } });
  if (!user) return NextResponse.json({ error: "Utilizator negăsit." }, { status: 404 });

  let cyberSource = isCyberSourceEnabledFor(user);
  // Личная подписка CyberSource уже есть → смена плана только через CyberSource (страница оплаты:
  // Basic → Pro — оплата с заменой подписки; Pro → Basic / тот же план — пояснение). Иначе оплата
  // через VictoriaBank создала бы второй план поверх подписки, которая продолжает списываться.
  if (purpose === "SUBSCRIPTION" && !cyberSource && (await hasOwnCsSubscription(sess.userId))) cyberSource = true;
  if (cyberSource && purpose === "AGENCY_SEATS") {
    const existing = await prisma.agency.findUnique({ where: { ownerId: sess.userId }, select: { id: true } });
    if (existing) cyberSource = false;
  }

  if (cyberSource) {
    const q = new URLSearchParams({ purpose });
    for (const k of ["plan", "seats", "takeOwnerSeat"]) {
      const v = form.get(k);
      if (typeof v === "string" && v) q.set(k, v);
    }
    return NextResponse.redirect(new URL(`/app/checkout?${q.toString()}`, request.url), 303);
  }

  // Прежний поток: тот же метод, заголовки (Accept — для HTML-ответа об ошибке) и поля формы.
  const headers = new Headers(request.headers);
  headers.delete("content-type"); // новый boundary выставит FormData
  headers.delete("content-length");
  form.delete("purpose");
  const forwarded = new Request(request.url, { method: "POST", headers, body: form });
  return purpose === "SUBSCRIPTION" ? vbInitiate(forwarded) : vbAgencyInitiate(forwarded);
}
