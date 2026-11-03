import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { cancelOwnSubscription, findOwnSubscription } from "@/lib/subscription-service";
import { cooldownLeftMs } from "@/lib/subscription-rules";

// POST /api/subscription/cancel — отмена в конце оплаченного периода (идемпотентно).
const COOLDOWN_MS = 5_000;

export async function POST() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const sub = await findOwnSubscription(sess.userId);
  const left = cooldownLeftMs(sub?.updatedAt ?? null, COOLDOWN_MS, new Date());
  if (left > 0) {
    return NextResponse.json({ error: "Încercați din nou peste câteva secunde." }, { status: 429 });
  }
  const res = await cancelOwnSubscription(sess.userId);
  if (!res.ok) return NextResponse.json({ error: res.message }, { status: res.status });
  return NextResponse.json({ changed: res.changed, subscription: res.subscription });
}
