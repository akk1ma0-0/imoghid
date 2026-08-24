import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { revokeExpiredAgencies } from "@/lib/agency";

// GET /api/cron/check-expired-agencies — отзыв доступа участникам агентств с истёкшим
// Agency.planExpiresAt (по аналогии с check-expired-plans). На Vercel Hobby лимит 2 cron-джобы
// (уже заняты check-expired-plans + reset-usage), поэтому в vercel.json этот роут НЕ добавлен —
// его логика вызывается из check-expired-plans (ежедневно). Этот эндпоинт оставлен для ручного
// запуска/тестов и на случай перехода на платный план Vercel с отдельным расписанием.
//
// Защита: Authorization: Bearer <CRON_SECRET> (как в остальных cron-роутах).
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
  const now = new Date();
  const members = await revokeExpiredAgencies(now);
  console.log(`[cron] check-expired-agencies: revoked ${members} member(s) of expired agencies`);
  return NextResponse.json({ ok: true, members, at: now.toISOString() });
}
