import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { completeCitPayment } from "@/lib/cybersource/cit";

// POST /api/payments/cs/complete { paymentId, result? } — после Unified Checkout в браузере.
// result (JWT результата) — только подсказка для поиска транзакции: сумму, валюту, статус и
// токены сервер перечитывает у CyberSource сам. Повторный вызов безопасен (идемпотентно).
//   200 paid / already_paid · 202 processing / unknown (повторить позже) · 402 declined ·
//   409 failed (несоответствие — ручной разбор) · 404 not_found.
const HTTP: Record<string, number> = {
  paid: 200,
  already_paid: 200,
  processing: 202,
  unknown: 202,
  declined: 402,
  failed: 409,
  not_found: 404,
};

export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const body = (await request.json().catch(() => null)) as { paymentId?: unknown; result?: unknown } | null;
  if (!body || typeof body.paymentId !== "string") {
    return NextResponse.json({ error: "Cerere invalidă." }, { status: 400 });
  }
  const res = await completeCitPayment({ paymentId: body.paymentId, actorUserId: sess.userId, resultJwt: body.result });
  // Код несоответствия наружу не отдаём — только статус.
  return NextResponse.json({ status: res.status }, { status: HTTP[res.status] ?? 500 });
}
