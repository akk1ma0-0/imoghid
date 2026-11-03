import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { findOwnSubscription, resumeOwnSubscription } from "@/lib/subscription-service";
import { cooldownLeftMs } from "@/lib/subscription-rules";

// POST /api/subscription/resume — отмена отмены, пока оплаченный период не закончился
// (идемпотентно). После EXPIRED или без токена — 409 с понятным текстом.
const COOLDOWN_MS = 5_000;

export async function POST() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const sub = await findOwnSubscription(sess.userId);
  if (cooldownLeftMs(sub?.updatedAt ?? null, COOLDOWN_MS, new Date()) > 0) {
    return NextResponse.json({ error: "Încercați din nou peste câteva secunde." }, { status: 429 });
  }
  const res = await resumeOwnSubscription(sess.userId);
  if (!res.ok) return NextResponse.json({ error: res.message }, { status: res.status });
  return NextResponse.json({ changed: res.changed, subscription: res.subscription });
}
