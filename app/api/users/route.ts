import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/users — список пользователей (безопасные поля, без passwordHash).
// Создание пользователей теперь делает /api/auth/register.
export async function GET() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      plan: true,
      agencyName: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(users);
}
