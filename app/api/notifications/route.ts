import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";

// GET /api/notifications — последние 20 уведомлений пользователя + число непрочитанных.
export async function GET() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: sess.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, title: true, body: true, createdAt: true, readAt: true },
    }),
    prisma.notification.count({ where: { userId: sess.userId, readAt: null } }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}
