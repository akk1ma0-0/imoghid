import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { completeCardChange } from "@/lib/cybersource/card-change";

// POST /api/subscription/card/complete { paymentId, result? } — после проверки карты в Unified
// Checkout. Сервер сам перечитывает транзакцию у CyberSource; result — только подсказка.
//   200 updated / already_done · 202 processing / unknown (повторить) · 402 declined ·
//   409 failed · 404 not_found.
const HTTP: Record<string, number> = { updated: 200, already_done: 200, processing: 202, unknown: 202, declined: 402, failed: 409, not_found: 404 };

export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const body = (await request.json().catch(() => null)) as { paymentId?: unknown; result?: unknown } | null;
  if (!body || typeof body.paymentId !== "string") return NextResponse.json({ error: "Cerere invalidă." }, { status: 400 });
  const res = await completeCardChange({ paymentId: body.paymentId, userId: sess.userId, resultJwt: body.result });
  return NextResponse.json({ status: res.status }, { status: HTTP[res.status] ?? 500 });
}
