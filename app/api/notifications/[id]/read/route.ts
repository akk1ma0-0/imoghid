import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/notifications/[id]/read — пометить прочитанным (только своё).
export async function PATCH(_req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  // updateMany с userId-фильтром = транзитивная проверка владения (не раскрываем чужие).
  const r = await prisma.notification.updateMany({
    where: { id, userId: sess.userId, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ updated: r.count });
}
