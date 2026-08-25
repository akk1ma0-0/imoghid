import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { removeAgencyMember, AgencyError } from "@/lib/agency";

// POST /api/agency/remove-member { userId } — владелец убирает участника: удаляет membership
// и сбрасывает его план (HUB → null, sessionVersion++). Освобождает место.
export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }
  const memberUserId = typeof body.userId === "string" ? body.userId : "";
  if (!memberUserId) {
    return NextResponse.json({ error: "userId lipsă." }, { status: 400 });
  }

  const agency = await prisma.agency.findUnique({
    where: { ownerId: sess.userId },
    select: { id: true },
  });
  if (!agency) {
    return NextResponse.json({ error: "Nu dețineți o agenție." }, { status: 403 });
  }

  try {
    await removeAgencyMember(agency.id, memberUserId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AgencyError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("remove-member error:", e);
    return NextResponse.json({ error: "Eroare la eliminarea membrului." }, { status: 500 });
  }
}
