import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";

// POST /api/user/logout-all-devices — явное «выйти со всех устройств».
// Инкремент sessionVersion → все ранее выпущенные JWT (на всех устройствах)
// становятся недействительными при следующем обращении к серверу (проверка в jwt-колбэке).
// Текущую вкладку разлогинивает клиент (signOut) после успешного ответа.
export async function POST() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  await prisma.user.update({
    where: { id: sess.userId },
    data: { sessionVersion: { increment: 1 } },
  });

  return NextResponse.json({ ok: true });
}
