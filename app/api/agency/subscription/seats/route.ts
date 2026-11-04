import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { consentMeta } from "@/lib/http-meta";
import { AGENCY_SEATS_CONSENT_VERSION } from "@/lib/recurring-consent";
import { cancelSeatReduction, findOwnAgencySubscription, scheduleSeatReduction } from "@/lib/agency-subscription-service";
import { cooldownLeftMs } from "@/lib/subscription-rules";

// POST   /api/agency/subscription/seats { seats, agreedToRecurring, consentVersion } — уменьшение мест
//        со следующего периода (без возврата), новое согласие на меньшую сумму.
// DELETE /api/agency/subscription/seats { agreedToRecurring, consentVersion } — отмена уменьшения,
//        согласие на прежнюю сумму. Докупка мест — через /api/payments/start (оплата сейчас).
const COOLDOWN_MS = 5_000;

async function guard(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return { response: sess.response };
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || body.agreedToRecurring !== true) {
    return { response: NextResponse.json({ error: "Bifați acordul pentru noua sumă lunară." }, { status: 400 }) };
  }
  if (body.consentVersion !== AGENCY_SEATS_CONSENT_VERSION) {
    return { response: NextResponse.json({ error: "Textul acordului s-a actualizat. Reîncărcați pagina." }, { status: 409 }) };
  }
  const sub = await findOwnAgencySubscription(sess.userId);
  if (cooldownLeftMs(sub?.updatedAt ?? null, COOLDOWN_MS, new Date()) > 0) {
    return { response: NextResponse.json({ error: "Încercați din nou peste câteva secunde." }, { status: 429 }) };
  }
  return { userId: sess.userId, body };
}

export async function POST(request: Request) {
  const g = await guard(request);
  if ("response" in g) return g.response;
  const res = await scheduleSeatReduction(g.userId, Number(g.body.seats), consentMeta(request));
  if (!res.ok) return NextResponse.json({ error: res.message }, { status: res.status });
  return NextResponse.json({ changed: res.changed, subscription: res.subscription });
}

export async function DELETE(request: Request) {
  const g = await guard(request);
  if ("response" in g) return g.response;
  const res = await cancelSeatReduction(g.userId, consentMeta(request));
  if (!res.ok) return NextResponse.json({ error: res.message }, { status: res.status });
  return NextResponse.json({ changed: res.changed, subscription: res.subscription });
}
