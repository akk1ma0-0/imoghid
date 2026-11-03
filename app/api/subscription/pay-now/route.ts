import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { findOwnSubscription } from "@/lib/subscription-service";
import { canPayNow, cooldownLeftMs } from "@/lib/subscription-rules";
import { chargeSubscriptionNow } from "@/lib/cybersource/billing-cycle";

// POST /api/subscription/pay-now — списание просроченного периода по текущей карте (MIT).
// Только PAST_DUE и активная карта. Один запуск за раз: ключ попытки (subscriptionId, periodStart,
// attemptNo) в БД + кулдаун 60 с — двойной клик/параллельный запрос не спишет дважды.
const COOLDOWN_MS = 60_000;

const RESULT: Record<string, { http: number; status: string; message: string }> = {
  charged: { http: 200, status: "paid", message: "Plata a reușit. Abonamentul este din nou activ." },
  already_extended: { http: 200, status: "paid", message: "Plata a reușit. Abonamentul este din nou activ." },
};
const PENDING = { http: 202, status: "processing", message: "Plata se verifică. Reveniți peste câteva minute." };
const DECLINED = { http: 402, status: "declined", message: "Plata a fost refuzată de bancă. Verificați cardul sau folosiți alt card." };
const NOT_NOW = { http: 409, status: "not_allowed", message: "Plata nu poate fi efectuată acum. Dacă problema persistă, contactați-ne la info@biseeth.md." };

function mapResult(r: string) {
  if (RESULT[r]) return RESULT[r];
  if (r === "unknown" || r === "in_flight" || r === "waiting_index" || r.startsWith("reconcile_") || r.startsWith("duplicate")) return PENDING;
  if (r.includes("failed") || r === "failure_already_applied") return DECLINED;
  return NOT_NOW; // hold:*, not_allowed и прочее
}

export async function POST() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const sub = await findOwnSubscription(sess.userId);
  if (!sub) return NextResponse.json({ status: "not_allowed", message: "Nu aveți un abonament cu reînnoire automată." }, { status: 404 });
  const check = canPayNow(sub, sub.paymentMethod);
  if (!check.ok) {
    const message = check.reason === "NO_CARD" ? "Actualizați mai întâi cardul." : check.reason === "NOT_PAST_DUE" ? "Nu există plăți restante." : NOT_NOW.message;
    return NextResponse.json({ status: "not_allowed", message }, { status: 409 });
  }
  const last = await prisma.payment.findFirst({
    where: { subscriptionId: sub.id, initiator: "MERCHANT" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (cooldownLeftMs(last?.createdAt ?? null, COOLDOWN_MS, new Date()) > 0) {
    return NextResponse.json({ status: "processing", message: "O plată a fost inițiată recent. Așteptați un minut." }, { status: 429 });
  }
  const r = mapResult(await chargeSubscriptionNow(sub.id));
  return NextResponse.json({ status: r.status, message: r.message }, { status: r.http });
}
