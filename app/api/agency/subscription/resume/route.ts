import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { findOwnAgencySubscription, resumeAgencySubscription } from "@/lib/agency-subscription-service";
import { cooldownLeftMs } from "@/lib/subscription-rules";

// POST /api/agency/subscription/resume — возобновление до конца оплаченного периода (идемпотентно).
const COOLDOWN_MS = 5_000;

export async function POST() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const sub = await findOwnAgencySubscription(sess.userId);
  if (cooldownLeftMs(sub?.updatedAt ?? null, COOLDOWN_MS, new Date()) > 0) {
    return NextResponse.json({ error: "Încercați din nou peste câteva secunde." }, { status: 429 });
  }
  const res = await resumeAgencySubscription(sess.userId);
  if (!res.ok) return NextResponse.json({ error: res.message }, { status: res.status });
  return NextResponse.json({ changed: res.changed, subscription: res.subscription });
}
