import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { csConfig, CsConfigError } from "@/lib/cybersource/client";
import { runBillingCycle } from "@/lib/cybersource/billing-cycle";

// POST /api/admin/cs-billing-run { subscriptionId?, forceNow? } — принудительный запуск цикла
// автосписаний. Только ADMIN и только тестовая среда CyberSource (CS_ENV=test); флаг
// CS_BILLING_ENABLED здесь не нужен. forceNow (с subscriptionId) ставит nextChargeAt = сейчас —
// списание за следующий период выполнится в этом же запуске (сценарии приёмки банка).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    if (csConfig().env !== "test") {
      return NextResponse.json({ error: "Disponibil doar în mediul de test CyberSource." }, { status: 403 });
    }
  } catch (e) {
    if (e instanceof CsConfigError) return NextResponse.json({ error: "CyberSource nu este configurat." }, { status: 503 });
    throw e;
  }
  const body = (await request.json().catch(() => ({}))) as { subscriptionId?: unknown; forceNow?: unknown };
  const subscriptionId = typeof body.subscriptionId === "string" ? body.subscriptionId : undefined;
  if (body.forceNow === true) {
    if (!subscriptionId) return NextResponse.json({ error: "forceNow cere subscriptionId." }, { status: 400 });
    const upd = await prisma.subscription.updateMany({
      where: { id: subscriptionId, provider: "CYBERSOURCE", status: { in: ["ACTIVE", "PAST_DUE"] } },
      data: { nextChargeAt: new Date() },
    });
    if (upd.count === 0) return NextResponse.json({ error: "Abonament activ CyberSource negăsit." }, { status: 404 });
  }
  const results = await runBillingCycle({ subscriptionId });
  return NextResponse.json({ ok: true, results });
}
