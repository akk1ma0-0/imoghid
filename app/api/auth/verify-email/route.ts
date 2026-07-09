import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

// GET /api/auth/verify-email?token=... — подтверждение e-mail по одноразовому токену.
// Успех → /email-verificat?status=success (публичная страница обновит сессию и уведёт на /app/pending).
// Истёк/невалиден → /email-verificat?status=expired|invalid.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const token = url.searchParams.get("token");
  const to = (status: string, type?: string) =>
    NextResponse.redirect(
      `${origin}/email-verificat?status=${status}${type ? `&type=${type}` : ""}`,
    );

  if (!token) return to("invalid");

  const row = await prisma.emailVerificationToken.findUnique({ where: { token } });
  if (!row) return to("invalid");

  if (row.expiresAt.getTime() <= Date.now()) {
    // Истёкший токен удаляем, чтобы не копился.
    await prisma.emailVerificationToken.delete({ where: { id: row.id } }).catch(() => {});
    return to("expired", row.newEmail ? "change" : undefined);
  }

  // ── Смена e-mail (токен привязан к новому адресу) ──
  if (row.newEmail) {
    // Гонка: за время ожидания подтверждения адрес мог занять другой пользователь.
    const taken = await prisma.user.findUnique({
      where: { email: row.newEmail },
      select: { id: true },
    });
    if (taken && taken.id !== row.userId) {
      await prisma.emailVerificationToken.deleteMany({ where: { userId: row.userId } });
      return to("invalid", "change");
    }
    // Меняем e-mail, помечаем подтверждённым и инкрементируем sessionVersion
    // (инвалидирует все прежние JWT на всех устройствах); чистим все токены пользователя.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        data: {
          email: row.newEmail,
          emailVerified: new Date(),
          sessionVersion: { increment: 1 },
        },
      }),
      prisma.emailVerificationToken.deleteMany({ where: { userId: row.userId } }),
    ]);
    return to("success", "change");
  }

  // ── Верификация текущего e-mail при регистрации (без изменений) ──
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { emailVerified: new Date() } }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: row.userId } }),
  ]);

  return to("success");
}
