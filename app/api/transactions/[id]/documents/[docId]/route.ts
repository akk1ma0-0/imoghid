import { NextResponse } from "next/server";
import { del } from "@vercel/blob";

import { prisma } from "@/lib/prisma";
import { requireSession, loadOwnedTransaction, notFound } from "@/lib/transaction-auth";

type Params = { params: Promise<{ id: string; docId: string }> };

// DELETE /api/transactions/[id]/documents/[docId]
// Удаляет документ: blob в Vercel Blob + запись TransactionDocument. Подтверждение не нужно (UI).
export async function DELETE(_req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id, docId } = await params;

  const tx = await loadOwnedTransaction(id, sess.userId);
  if (!tx) return notFound();

  const doc = await prisma.transactionDocument.findFirst({
    where: { id: docId, transactionId: id },
    select: { id: true, fileUrl: true },
  });
  if (!doc) return notFound();

  // Удаляем файл из Blob (best-effort) — legacy локальные пути пропускаем.
  if (/^https?:\/\//.test(doc.fileUrl)) await del(doc.fileUrl).catch(() => {});

  // Снимаем ссылки чеклиста на документ, затем удаляем запись.
  await prisma.$transaction([
    prisma.notarChecklistItem.updateMany({ where: { documentId: docId }, data: { documentId: null } }),
    prisma.transactionDocument.delete({ where: { id: docId } }),
  ]);

  return NextResponse.json({ ok: true });
}
