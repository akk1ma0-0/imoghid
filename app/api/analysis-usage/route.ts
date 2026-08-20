import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { getUsage } from "@/lib/usage";

// GET /api/analysis-usage — текущее использование анализов дела (DOSAR_ANALYSIS) за
// расчётный период, без записи. Источник — UsageCounter (единая тарифная система).
export async function GET() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  const { used, limit } = await getUsage(sess.userId, "DOSAR_ANALYSIS");
  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { plan: true },
  });
  return NextResponse.json({ used, limit, plan: user?.plan ?? null });
}
