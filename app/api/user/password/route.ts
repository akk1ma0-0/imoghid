import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";

// PATCH /api/user/password — { currentPassword, newPassword, confirmPassword }
export async function PATCH(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const { currentPassword, newPassword, confirmPassword } = body;
  if (
    typeof currentPassword !== "string" ||
    typeof newPassword !== "string" ||
    typeof confirmPassword !== "string"
  ) {
    return NextResponse.json({ error: "Completați toate câmpurile." }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "Parolele noi nu coincid." }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "Parola nouă trebuie să aibă minimum 8 caractere." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { passwordHash: true },
  });
  if (!user) return NextResponse.json({ error: "Utilizator negăsit." }, { status: 404 });

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Parola curentă este incorectă." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: sess.userId }, data: { passwordHash } });
  return NextResponse.json({ ok: true });
}
