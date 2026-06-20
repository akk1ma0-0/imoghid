import { NextResponse } from "next/server";

import { auth } from "@/auth";

// Гард для admin-API: возвращает { userId } только для роли ADMIN, иначе { response }.
// 401 — нет сессии; 403 — есть сессия, но не админ (не раскрываем детали).
export async function requireAdmin(): Promise<
  { userId: string } | { response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { response: NextResponse.json({ error: "Neautentificat." }, { status: 401 }) };
  }
  if (session.user.role !== "ADMIN") {
    return { response: NextResponse.json({ error: "Acces interzis." }, { status: 403 }) };
  }
  return { userId: session.user.id };
}
