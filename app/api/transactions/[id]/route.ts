import { NextResponse } from "next/server";
import { rm } from "node:fs/promises";
import path from "node:path";
import { del } from "@vercel/blob";
import type { DealType, PartyType, TransactionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireSession, loadOwnedTransaction, notFound } from "@/lib/transaction-auth";
import { stepToNumber, numberToStep, isValidStepNumber } from "@/lib/steps";

type Params = { params: Promise<{ id: string }> };

const DEAL_TYPES: DealType[] = ["VANZARE_CUMPARARE", "DONATIE", "SCHIMB", "ALT_TIP"];
const PARTY_TYPES: PartyType[] = ["PERSOANA_FIZICA", "PERSOANA_JURIDICA"];

// GET /api/transactions/[id] — полная транзакция со связями.
export async function GET(_req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  const tx = await loadOwnedTransaction(id, sess.userId, {
    documents: { orderBy: { uploadedAt: "asc" } },
    extractedFields: true,
    flags: { orderBy: { createdAt: "asc" } },
    owners: { orderBy: { objectIndex: "asc" } },
    notarChecklist: { orderBy: { sortOrder: "asc" }, include: { document: true } },
    calculation: true,
  });
  if (!tx) return notFound();

  return NextResponse.json({
    transaction: { ...tx, currentStepNumber: stepToNumber(tx.currentStep) },
  });
}

// PATCH /api/transactions/[id] — обновить поля и/или currentStep (число 1–8).
export async function PATCH(request: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  const existing = await loadOwnedTransaction(id, sess.userId);
  if (!existing) return notFound();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() || null : undefined);

  for (const key of [
    "address",
    "cadastralNo",
    "objectType",
    "suprafata",
    "destinatie",
    "valoare",
    "verificareImobil",
    "clientName",
    "clientPhone",
    "clientContractRef",
  ] as const) {
    const v = str(body[key]);
    if (v !== undefined) data[key] = v;
  }
  if (DEAL_TYPES.includes(body.dealType as DealType)) data.dealType = body.dealType;
  if (PARTY_TYPES.includes(body.sellerType as PartyType)) data.sellerType = body.sellerType;
  if (PARTY_TYPES.includes(body.buyerType as PartyType)) data.buyerType = body.buyerType;

  if (body.currentStep !== undefined) {
    if (!isValidStepNumber(body.currentStep)) {
      return NextResponse.json({ error: "Pas invalid." }, { status: 400 });
    }
    const stepNum = body.currentStep as number;
    data.currentStep = numberToStep(stepNum);
    // Авто-финализация убрана: статус НЕ меняется при достижении шага 8.
    // Риелтор переводит транзакцию в «Finisat» вручную из «Obiectele mele».
  }

  // Смена статуса из «Obiectele mele» (active/waiting/done/archive).
  const STATUSES: TransactionStatus[] = ["ACTIVE", "WAITING", "DONE", "ARCHIVE"];
  if (typeof body.status === "string") {
    const s = body.status.toUpperCase() as TransactionStatus;
    if (!STATUSES.includes(s)) {
      return NextResponse.json({ error: "Status invalid." }, { status: 400 });
    }
    data.status = s;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nimic de actualizat." }, { status: 400 });
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data,
    select: { id: true, currentStep: true, completedAt: true },
  });

  return NextResponse.json({
    transaction: { ...updated, currentStepNumber: stepToNumber(updated.currentStep) },
  });
}

// DELETE /api/transactions/[id] — удаление транзакции с каскадом и физическими файлами.
export async function DELETE(_req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  // Явная проверка прав: 404 если нет, 403 если чужая.
  const tx = await prisma.transaction.findUnique({
    where: { id },
    select: { id: true, userId: true, documents: { select: { fileUrl: true } } },
  });
  if (!tx) return notFound();
  if (tx.userId !== sess.userId) {
    return NextResponse.json({ error: "Acces interzis." }, { status: 403 });
  }

  // Report не имеет onDelete: Cascade — удаляем явно, остальное каскадом через схему.
  await prisma.$transaction([
    prisma.report.deleteMany({ where: { transactionId: id } }),
    prisma.transaction.delete({ where: { id } }),
  ]);

  // Файлы документов: Vercel Blob (по URL) + legacy локальная папка.
  const blobUrls = tx.documents.map((d) => d.fileUrl).filter((u) => /^https?:\/\//.test(u));
  if (blobUrls.length) await del(blobUrls).catch(() => {});
  await rm(path.join(process.cwd(), "public", "uploads", id), {
    recursive: true,
    force: true,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
