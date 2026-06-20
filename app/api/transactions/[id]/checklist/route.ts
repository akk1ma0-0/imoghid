import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession, loadOwnedTransaction, notFound } from "@/lib/transaction-auth";
import { buildChecklist } from "@/lib/checklist/catalog";

type Params = { params: Promise<{ id: string }> };

// GET /api/transactions/[id]/checklist — список документов для нотариуса.
export async function GET(_req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  const tx = await loadOwnedTransaction(id, sess.userId);
  if (!tx) return notFound();

  const items = await prisma.notarChecklistItem.findMany({
    where: { transactionId: id },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ items });
}

// POST /api/transactions/[id]/checklist — (пере)генерация списка из dealType + флагов.
export async function POST(_req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  const tx = await loadOwnedTransaction(id, sess.userId, {
    flags: true,
    owners: true,
    notarChecklist: true,
  });
  if (!tx) return notFound();

  const flagCodes = tx.flags.map((f) => f.code);
  const hasLegalEntitySeller =
    tx.sellerType === "PERSOANA_JURIDICA" || tx.owners.some((o) => o.isLegalEntity);
  const needsSpouseConsent =
    tx.owners.some((o) => o.acordSotRequired) ||
    (tx.sellerType === "PERSOANA_FIZICA" &&
      (tx.dealType === "VANZARE_CUMPARARE" || tx.dealType === "SCHIMB"));

  const templates = buildChecklist({
    dealType: tx.dealType,
    flagCodes,
    hasLegalEntitySeller,
    needsSpouseConsent,
  });

  // Сохраняем isUploaded/documentId по documentKey при перегенерации.
  const prior = new Map(
    tx.notarChecklist.map((i) => [`${i.party}:${i.documentKey}`, i]),
  );

  await prisma.$transaction(async (db) => {
    await db.notarChecklistItem.deleteMany({ where: { transactionId: id } });
    await db.notarChecklistItem.createMany({
      data: templates.map((t) => {
        const carried = prior.get(`${t.party}:${t.documentKey}`);
        return {
          transactionId: id,
          party: t.party,
          documentKey: t.documentKey,
          labelRo: t.labelRo,
          isRequired: t.isRequired,
          isUploaded: carried?.isUploaded ?? false,
          documentId: carried?.documentId ?? null,
          sortOrder: t.sortOrder,
        };
      }),
    });
  });

  const items = await prisma.notarChecklistItem.findMany({
    where: { transactionId: id },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ items });
}
