import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";

// PATCH /api/user/profile — { name?, agentie?, telefon?, notifLegislatie? }
// agentie → agencyName, telefon → phone (переиспользуем существующие поля User).
export async function PATCH(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const optStr = (v: unknown) =>
    typeof v === "string" ? (v.trim() || null) : undefined;

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: "Numele este obligatoriu." }, { status: 400 });
    data.name = n;
  }
  const agentie = optStr(body.agentie);
  if (agentie !== undefined) data.agencyName = agentie;
  const telefon = optStr(body.telefon);
  if (telefon !== undefined) data.phone = telefon;
  if (typeof body.notifLegislatie === "boolean") data.notifLegislatie = body.notifLegislatie;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nimic de actualizat." }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: sess.userId },
    data,
    select: { name: true, agencyName: true, phone: true, notifLegislatie: true },
  });
  return NextResponse.json({ user });
}
