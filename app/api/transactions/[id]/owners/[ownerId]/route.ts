import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession, notFound } from "@/lib/transaction-auth";

type Params = { params: Promise<{ id: string; ownerId: string }> };

const BOOL_FIELDS = [
  "isMinor",
  "isLegalEntity",
  "acordSotRequired",
  "acordSotObtained",
  "tutorApprovalRequired",
  "tutorApprovalObtained",
  "foundersDecisionRequired",
  "foundersDecisionObtained",
  "dataActualizationRequired",
  "dataActualizationDone",
] as const;

// PATCH /api/transactions/[id]/owners/[ownerId] — переключатели согласований.
export async function PATCH(request: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id, ownerId } = await params;

  // Транзитивная проверка владения.
  const owner = await prisma.propertyOwner.findFirst({
    where: { id: ownerId, transaction: { id, userId: sess.userId } },
    select: { id: true },
  });
  if (!owner) return notFound();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const data: Record<string, boolean> = {};
  for (const key of BOOL_FIELDS) {
    if (typeof body[key] === "boolean") data[key] = body[key] as boolean;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nimic de actualizat." }, { status: 400 });
  }

  const updated = await prisma.propertyOwner.update({ where: { id: ownerId }, data });
  return NextResponse.json({ owner: updated });
}
