import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Молдавский формат: +373 + 8 цифр или 0 + 8 цифр (после удаления пробелов/дефисов).
const PHONE_RE = /^(\+373\d{8}|0\d{8})$/;

// POST /api/auth/register — открытая регистрация (без кода приглашения).
// { name, email, phone, password, agencyName? } → BASIC, неактивна (выбор плана на /subscribe).
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const agencyName =
    typeof body.agencyName === "string" && body.agencyName.trim()
      ? body.agencyName.trim()
      : null;

  // Валидация
  if (!name) {
    return NextResponse.json({ error: "Numele este obligatoriu." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Email invalid." }, { status: 400 });
  }
  // Telefon — opțional; dacă e indicat, verificăm formatul.
  if (phone && !PHONE_RE.test(phone.replace(/[\s\-()]/g, ""))) {
    return NextResponse.json(
      { error: "Telefon invalid. Format: +373 XX XXX XXX sau 0XX XXX XXX." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Parola trebuie să aibă minimum 8 caractere." },
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
    // Регистрация открытая: без плана (plan = null) — активирует администратор.
    const user = await prisma.user.create({
      data: { name, email, phone: phone || null, passwordHash, agencyName },
      select: { id: true, email: true, plan: true },
    });

    return NextResponse.json(
      { id: user.id, email: user.email, plan: user.plan, planActive: false },
      { status: 201 },
    );
  } catch (error) {
    console.error("register error:", error);
    return NextResponse.json({ error: "Nu s-a putut crea contul." }, { status: 500 });
  }
}
