import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";

// PATCH /api/user/locale — { locale: "ro" | "ru" }. Сохраняет выбор языка в БД,
// чтобы он применялся при следующем входе (пока используется на waitlist-странице).
export async function PATCH(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  const body = await request.json().catch(() => ({}));
  const locale = body?.locale;
  if (locale !== "ro" && locale !== "ru") {
    return NextResponse.json({ error: "Locale invalid." }, { status: 400 });
  }

  await prisma.user.update({ where: { id: sess.userId }, data: { locale } });
  return NextResponse.json({ ok: true, locale });
}
