import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { AGENCY_MIN_SEATS } from "@/lib/plan-limits";

const AGENCY_PERIOD_DAYS = 30;

// POST /api/admin/agency { email, seatsPaid, pricePerSeatMdl } — ручное создание/обновление
// агентства с ДОГОВОРНОЙ ценой (минуя автоматический чекаут). Помечает negotiated=true.
// Не раздаёт места (владелец распределяет через инвайты). ADMIN-only.
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
  const seatsPaid = Number(body.seatsPaid);
  const pricePerSeatMdl = Number(body.pricePerSeatMdl);

  if (!email) return NextResponse.json({ error: "Email lipsă." }, { status: 400 });
  if (!Number.isInteger(seatsPaid) || seatsPaid < AGENCY_MIN_SEATS) {
    return NextResponse.json(
      { error: `seatsPaid trebuie să fie un întreg ≥ ${AGENCY_MIN_SEATS}.` },
      { status: 400 },
    );
  }
  if (!Number.isInteger(pricePerSeatMdl) || pricePerSeatMdl < 0) {
    return NextResponse.json({ error: "pricePerSeatMdl invalid." }, { status: 400 });
  }

  const owner = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!owner) {
    return NextResponse.json({ error: "Utilizator cu acest email negăsit." }, { status: 404 });
  }

  const now = new Date();
  const planExpiresAt = new Date(now.getTime() + AGENCY_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const agency = await prisma.agency.upsert({
    where: { ownerId: owner.id },
    update: { seatsPaid, pricePerSeatMdl, negotiated: true, planExpiresAt },
    create: { ownerId: owner.id, seatsPaid, pricePerSeatMdl, negotiated: true, planExpiresAt },
    select: { id: true, seatsPaid: true, pricePerSeatMdl: true, planExpiresAt: true },
  });

  console.log(
    `[admin] agency upsert owner=${owner.id} seats=${seatsPaid} price=${pricePerSeatMdl} (negotiated)`,
  );
  return NextResponse.json({ ok: true, agency });
}
