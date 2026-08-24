import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";
import { revokeExpiredAgencies } from "@/lib/agency";

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
    at: now.toISOString(),
  });
}
