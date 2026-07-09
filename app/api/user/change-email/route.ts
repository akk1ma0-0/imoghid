import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { createVerificationToken, sendEmailChangeEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHANGE_COOLDOWN_MS = 60_000; // не чаще 1 запроса в 60 сек на пользователя (как resend)

// POST /api/user/change-email — { newEmail, currentPassword }
// Инициирует смену e-mail: создаёт токен на НОВЫЙ адрес и шлёт письмо-подтверждение.
// E-mail в БД меняется только после перехода по ссылке (GET /api/auth/verify-email).
// Старый e-mail остаётся действующим для входа, пока новый не подтверждён.
export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const { newEmail, currentPassword } = body;
  if (typeof newEmail !== "string" || typeof currentPassword !== "string") {
    return NextResponse.json({ error: "Completați toate câmpurile." }, { status: 400 });
  }

  const email = newEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Introduceți o adresă de e-mail validă." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { email: true, passwordHash: true },
  });
  if (!user) return NextResponse.json({ error: "Utilizator negăsit." }, { status: 404 });

  // Подтверждение пароля — защита от смены e-mail за незалоченным компьютером.
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Parola curentă este incorectă." }, { status: 400 });
  }

  if (email === user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "Noua adresă coincide cu cea curentă." },
      { status: 400 },
    );
  }

  const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (taken) {
    return NextResponse.json(
      { error: "Această adresă de e-mail este deja folosită." },
      { status: 409 },
    );
  }

  // Rate-limit: смотрим самый свежий токен пользователя (тот же паттерн, что resend-verification).
  const last = await prisma.emailVerificationToken.findFirst({
    where: { userId: sess.userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (last) {
    const elapsed = Date.now() - last.createdAt.getTime();
    if (elapsed < CHANGE_COOLDOWN_MS) {
      const wait = Math.ceil((CHANGE_COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        { error: `Așteptați ${wait} secunde înainte de a solicita din nou.`, retryAfter: wait },
        { status: 429 },
      );
    }
  }

  const token = await createVerificationToken(sess.userId, email);
  await sendEmailChangeEmail(email, token, new URL(request.url).origin);

  return NextResponse.json({ ok: true, newEmail: email });
}
