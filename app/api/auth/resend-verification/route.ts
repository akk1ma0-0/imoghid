import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { createVerificationToken, sendVerificationEmail } from "@/lib/email";

const RESEND_COOLDOWN_MS = 60_000; // не чаще 1 раза в 60 сек на пользователя

// POST /api/auth/resend-verification — повторная отправка письма подтверждения.
export async function POST(req: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { email: true, emailVerified: true },
  });
  if (!user) return NextResponse.json({ error: "Utilizator negăsit." }, { status: 404 });
  if (user.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

  // Рейт-лимит: смотрим самый свежий токен пользователя.
  const last = await prisma.emailVerificationToken.findFirst({
    where: { userId: sess.userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (last) {
    const elapsed = Date.now() - last.createdAt.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        { error: `Așteptați ${wait} secunde înainte de a retrimite.`, retryAfter: wait },
        { status: 429 },
      );
    }
  }

  const token = await createVerificationToken(sess.userId);
  await sendVerificationEmail(user.email, token, new URL(req.url).origin);
  return NextResponse.json({ ok: true });
}
