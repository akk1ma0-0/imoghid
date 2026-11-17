import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { canViewJurnal } from "@/lib/audit-roles";
import { prisma } from "@/lib/prisma";

// Гард журнала/выгрузок: ADMIN и AUDITOR. Роль читается ИЗ БД (не из JWT) и блокировка тоже —
// понижение роли или блокировка действуют немедленно, даже на уже выданный токен.
export async function requireAuditAccess(): Promise<
  { userId: string; role: "ADMIN" | "AUDITOR" } | { response: NextResponse }
> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return { response: NextResponse.json({ error: "Neautentificat." }, { status: 401 }) };
  const u = await prisma.user.findUnique({ where: { id }, select: { role: true, isBlocked: true } });
  if (!u || u.isBlocked || !canViewJurnal(u.role)) {
    return { response: NextResponse.json({ error: "Acces interzis." }, { status: 403 }) };
  }
  return { userId: id, role: u.role as "ADMIN" | "AUDITOR" };
}

// Для серверной страницы (404 вместо раскрытия существования раздела).
export async function getAuditViewer(): Promise<{ userId: string; role: "ADMIN" | "AUDITOR" } | null> {
  const r = await requireAuditAccess();
  return "response" in r ? null : r;
}
