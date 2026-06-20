import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession, notFound } from "@/lib/transaction-auth";

type Params = { params: Promise<{ id: string; itemId: string }> };

// PATCH /api/transactions/[id]/checklist/[itemId] — отметить isUploaded.
export async function PATCH(request: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id, itemId } = await params;

  const item = await prisma.notarChecklistItem.findFirst({
    where: { id: itemId, transaction: { id, userId: sess.userId } },
    select: { id: true },
  });
  if (!item) return notFound();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.isUploaded === "boolean") data.isUploaded = body.isUploaded;
  if (typeof body.documentId === "string" || body.documentId === null) {
    data.documentId = body.documentId;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nimic de actualizat." }, { status: 400 });
  }

  const updated = await prisma.notarChecklistItem.update({ where: { id: itemId }, data });
  return NextResponse.json({ item: updated });
}
