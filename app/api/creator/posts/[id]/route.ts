import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/creator/posts/[id] — удаляет генерацию пользователя из галереи.
export async function DELETE(_req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  await prisma.creatorPost.deleteMany({ where: { id, userId: sess.userId } });
  return NextResponse.json({ ok: true });
}
