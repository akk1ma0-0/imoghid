import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { analysisLimit, effectiveUsed } from "@/lib/analysis-limits";

// GET /api/analysis-usage — текущее использование анализов (с месячным сбросом, без записи).
export async function GET() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { plan: true, analysisCount: true, analysisCountResetAt: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
  }

  const used = effectiveUsed(user, new Date());
  return NextResponse.json({ used, limit: analysisLimit(user.plan), plan: user.plan });
}
