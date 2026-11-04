import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { findOwnSubscription } from "@/lib/subscription-service";
import { cooldownLeftMs } from "@/lib/subscription-rules";
import { cancelScheduledDowngrade, scheduleDowngrade } from "@/lib/plan-change-service";

// POST   /api/subscription/downgrade — Pro → Basic со следующего периода (без списания сейчас).
// DELETE /api/subscription/downgrade — отменить запланированную смену (до начала списания).
// Оба идемпотентны: повтор → { changed: false }. Только своя подписка CyberSource.
const COOLDOWN_MS = 5_000;

async function guard() {
  const sess = await requireSession();
  if ("response" in sess) return { response: sess.response };
  const sub = await findOwnSubscription(sess.userId);
  if (cooldownLeftMs(sub?.updatedAt ?? null, COOLDOWN_MS, new Date()) > 0) {
    return { response: NextResponse.json({ error: "Încercați din nou peste câteva secunde." }, { status: 429 }) };
  }
  return { userId: sess.userId };
}

export async function POST() {
  const g = await guard();
  if ("response" in g) return g.response;
  const res = await scheduleDowngrade(g.userId);
  if (!res.ok) return NextResponse.json({ error: res.message }, { status: res.status });
  return NextResponse.json({ changed: res.changed, subscription: res.subscription });
}

export async function DELETE() {
  const g = await guard();
  if ("response" in g) return g.response;
  const res = await cancelScheduledDowngrade(g.userId);
  if (!res.ok) return NextResponse.json({ error: res.message }, { status: res.status });
  return NextResponse.json({ changed: res.changed, subscription: res.subscription });
}
