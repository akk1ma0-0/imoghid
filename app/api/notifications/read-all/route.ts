import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";

// PATCH /api/notifications/read-all — пометить все непрочитанные прочитанными.
export async function PATCH() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  const r = await prisma.notification.updateMany({
    where: { userId: sess.userId, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ updated: r.count });
}
