import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";
import { revokeExpiredAgencies } from "@/lib/agency";
import { billingEnabled, runBillingCycle } from "@/lib/cybersource/billing-cycle";

// GET /api/cron/check-expired-plans — ежедневный отзыв истёкших планов (Vercel Cron).
// Находит plan != null И planExpiresAt < now() → сбрасывает план и инкрементирует
// sessionVersion (мгновенный разлогин). Ручные планы админа (planExpiresAt = null)
// НЕ затрагиваются. Автопродление/повторное списание тут НЕ реализуется.
//
// Защита: заголовок Authorization: Bearer <CRON_SECRET> (Vercel Cron шлёт его автоматически,
// если задан env CRON_SECRET). Без валидного секрета — 401.
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Сначала автосписания CyberSource (CS_BILLING_ENABLED=true): успешное продление сдвигает
  // planExpiresAt до проверки истёкших планов ниже. Отдельный cron не заводим (лимит Hobby — 2).
  // Сбой биллинга не должен блокировать отзыв истёкших планов.
  let billing: { processed: number; byResult: Record<string, number> } | null = null;
  if (billingEnabled()) {
    try {
      const results = await runBillingCycle();
      const byResult: Record<string, number> = {};
      for (const r of results) byResult[r.result] = (byResult[r.result] ?? 0) + 1;
      billing = { processed: results.length, byResult };
    } catch (e) {
      console.error("[cron] billing cycle failed", e);
    }
  }

  const now = new Date();
  const result = await prisma.user.updateMany({
    // planExpiresAt: { lt: now } уже исключает NULL (SQL: NULL < now → не истинно).
    where: { plan: { not: null }, planExpiresAt: { lt: now } },
    data: {
      plan: null,
      planActivatedAt: null,
      planExpiresAt: null,
      sessionVersion: { increment: 1 },
    },
  });

  // HUB/Agenție: участники с материализованным планом HUB имеют planExpiresAt=null (их
  // выше не задело), поэтому истечение агентств отзываем отдельно — по Agency.planExpiresAt.
  // Вынесено сюда (а не в отдельный cron), т.к. Vercel Hobby лимит = 2 cron-джобы.
  const agencyMembers = await revokeExpiredAgencies(now);

  console.log(
    `[cron] check-expired-plans: revoked ${result.count} expired plan(s), ${agencyMembers} agency member(s)`,
  );
  return NextResponse.json({
    ok: true,
    revoked: result.count,
    agencyMembers,
    billing,
    at: now.toISOString(),
  });
}
