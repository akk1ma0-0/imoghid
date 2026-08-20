import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";
import { currentPeriod } from "@/lib/plan-limits";

// GET /api/cron/reset-usage — ежедневный сброс истёкших счётчиков использования (Vercel Cron).
// Периоды у пользователей индивидуальны (откатной месяц от planActivatedAt), поэтому сброс —
// по каждой записи UsageCounter с periodEnd <= now: обнуляем count и сдвигаем период на текущий.
// Подстраховка: consumeUsage/getUsage и так само-сбрасывают при истёкшем периоде — cron лишь
// поддерживает таблицу в актуальном состоянии.
//
// Защита: Authorization: Bearer <CRON_SECRET> (как в check-expired-plans).
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
  const stale = await prisma.usageCounter.findMany({
    where: { periodEnd: { lte: now } },
    select: {
      id: true,
      user: { select: { planActivatedAt: true, createdAt: true } },
    },
  });

  let reset = 0;
  for (const c of stale) {
    const anchor = c.user.planActivatedAt ?? c.user.createdAt;
    const { start, end } = currentPeriod(anchor, now);
    await prisma.usageCounter.update({
      where: { id: c.id },
      data: { count: 0, periodStart: start, periodEnd: end },
    });
    reset++;
  }

  console.log(`[cron] reset-usage: reset ${reset} expired usage counter(s)`);
  return NextResponse.json({ ok: true, reset, at: now.toISOString() });
}
