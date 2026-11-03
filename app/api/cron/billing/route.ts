import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { billingEnabled, runBillingCycle } from "@/lib/cybersource/billing-cycle";

// GET /api/cron/billing — цикл автосписаний CyberSource (Authorization: Bearer <CRON_SECRET>).
// В vercel.json НЕ добавлен (лимит Hobby — 2 cron-задачи): ежедневно цикл вызывается из
// check-expired-plans. Роут — для ручного запуска / будущего отдельного расписания.
// Без CS_BILLING_ENABLED=true ничего не списывает.
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!authorized(request)) return new NextResponse("Unauthorized", { status: 401 });
  if (!billingEnabled()) return NextResponse.json({ ok: true, skipped: "CS_BILLING_ENABLED is off" });
  const results = await runBillingCycle();
  return NextResponse.json({ ok: true, processed: results.length, results });
}
