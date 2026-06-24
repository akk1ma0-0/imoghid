import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireSession, loadOwnedTransaction, notFound } from "@/lib/transaction-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/transactions/[id]/report — сохранённый отчёт (Fișa obiectului) или null.
export async function GET(_req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  const tx = await loadOwnedTransaction(id, sess.userId);
  if (!tx) return notFound();

  const report = await prisma.transactionReport.findUnique({ where: { transactionId: id } });
  return NextResponse.json({ report });
}

// POST /api/transactions/[id]/report — создаёт/обновляет отчёт (upsert).
export async function POST(req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  const tx = await loadOwnedTransaction(id, sess.userId);
  if (!tx) return notFound();

  let body: { content?: unknown; docxUrl?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }
  if (!body.content || typeof body.content !== "object") {
    return NextResponse.json({ error: "Conținut invalid." }, { status: 400 });
  }
  const content = body.content as Prisma.InputJsonValue;
  const docxUrl =
    typeof body.docxUrl === "string" && /^https:\/\//.test(body.docxUrl) ? body.docxUrl : null;

  const report = await prisma.transactionReport.upsert({
    where: { transactionId: id },
    create: { transactionId: id, content, docxUrl },
    update: { content, ...(docxUrl ? { docxUrl } : {}) },
    select: { id: true, docxUrl: true, updatedAt: true },
  });
  return NextResponse.json({ report });
}
