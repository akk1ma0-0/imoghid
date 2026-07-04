import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

// GET /api/auth/verify-email?token=... — подтверждение e-mail по одноразовому токену.
// Успех → /email-verificat?status=success (публичная страница обновит сессию и уведёт на /app/pending).
// Истёк/невалиден → /email-verificat?status=expired|invalid.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const token = url.searchParams.get("token");
  const to = (status: string) => NextResponse.redirect(`${origin}/email-verificat?status=${status}`);

  if (!token) return to("invalid");

  const row = await prisma.emailVerificationToken.findUnique({ where: { token } });
  if (!row) return to("invalid");

  if (row.expiresAt.getTime() <= Date.now()) {
    // Истёкший токен удаляем, чтобы не копился.
    await prisma.emailVerificationToken.delete({ where: { id: row.id } }).catch(() => {});
    return to("expired");
  }

  // Подтверждаем e-mail и удаляем все токены пользователя (одноразовость).
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { emailVerified: new Date() } }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: row.userId } }),
  ]);

  return to("success");
}
