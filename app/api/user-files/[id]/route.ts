import { NextResponse } from "next/server";
import { del } from "@vercel/blob";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/user-files/[id] — удаляет файл из Blob + запись из БД.
export async function DELETE(_req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  const file = await prisma.userFile.findFirst({
    where: { id, userId: sess.userId },
  });
  if (!file) return NextResponse.json({ error: "Fișier negăsit." }, { status: 404 });

  if (/^https:\/\//.test(file.blobUrl)) {
    try {
      await del(file.blobUrl);
    } catch {
      /* best-effort: даже если blob уже удалён — чистим запись */
    }
  }
  await prisma.userFile.delete({ where: { id: file.id } });
  return NextResponse.json({ ok: true });
}
