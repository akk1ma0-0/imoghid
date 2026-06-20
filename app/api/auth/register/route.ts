import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { SubscriptionPlan } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { redeemInvite, InviteError } from "@/lib/invite";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Минимум 8 символов, хотя бы одна заглавная буква и одна цифра.
function isStrongPassword(pw: string): boolean {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
}

// POST /api/auth/register
// { name, email, phone, password, agencyName?, inviteCode? }
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const agencyName =
    typeof body.agencyName === "string" && body.agencyName.trim()
      ? body.agencyName.trim()
      : null;
  const inviteCode =
    typeof body.inviteCode === "string" && body.inviteCode.trim()
      ? body.inviteCode.trim()
      : null;

  // Валидация
  if (!name) {
    return NextResponse.json({ error: "Numele este obligatoriu." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Email invalid." }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json(
      { error: "Telefonul este obligatoriu." },
      { status: 400 },
    );
  }
  if (!isStrongPassword(password)) {
    return NextResponse.json(
      {
        error:
          "Parola trebuie să aibă minimum 8 caractere, o literă mare și o cifră.",
      },
      { status: 400 },
    );
  }

  // Уникальность email
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "Există deja un cont cu acest email." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.$transaction(async (tx) => {
      let plan: SubscriptionPlan = "BASIC";
      let planActivatedAt: Date | null = null;

      // Валидный код приглашения → активирует PRO (или план кода) и инкрементит usedCount.
      if (inviteCode) {
        plan = await redeemInvite(tx, inviteCode);
        planActivatedAt = new Date();
      }

      return tx.user.create({
        data: {
          name,
          email,
          phone,
          passwordHash,
          agencyName,
          plan,
          planActivatedAt,
        },
        select: { id: true, email: true, plan: true, planActivatedAt: true },
      });
    });

    return NextResponse.json(
      {
        id: user.id,
        email: user.email,
        plan: user.plan,
        planActive: !!user.planActivatedAt,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof InviteError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("register error:", error);
    return NextResponse.json(
      { error: "Nu s-a putut crea contul." },
      { status: 500 },
    );
  }
}
