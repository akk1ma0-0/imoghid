import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession, loadOwnedTransaction, notFound } from "@/lib/transaction-auth";

type Params = { params: Promise<{ id: string }> };

const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

// POST /api/transactions/[id]/documents
// Файл уже загружен напрямую в Vercel Blob (см. .../documents/blob). Здесь приходит
// только метадата (URL + имя/размер/тип) — крошечный JSON, без лимита тела.
export async function POST(request: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  const tx = await loadOwnedTransaction(id, sess.userId);
  if (!tx) return notFound();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const blobUrl = typeof body.blobUrl === "string" ? body.blobUrl : "";
  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 200) : "";
  const fileSize = typeof body.fileSize === "number" ? body.fileSize : 0;
  const rawMime = typeof body.mimeType === "string" ? body.mimeType : "";

  if (!/^https:\/\//.test(blobUrl)) {
    return NextResponse.json({ error: "URL fișier invalid." }, { status: 400 });
  }
  if (!ALLOWED.has(rawMime)) {
    return NextResponse.json(
      { error: `Format neacceptat: ${fileName || "fișier"} (doar PDF, JPG, PNG).` },
      { status: 400 },
    );
  }
  if (fileSize > MAX_SIZE) {
    return NextResponse.json(
      { error: `Fișier prea mare: ${fileName || "fișier"} (max 20 MB).` },
      { status: 400 },
    );
  }

  // objectIndex (1 / 2 для Schimb)
  let objectIndex = 1;
  const oi = body.objectIndex;
  if (oi === 2 || oi === "2") objectIndex = 2;
  if (objectIndex === 2 && tx.dealType !== "SCHIMB") {
    return NextResponse.json(
      { error: "Obiectul 2 este valabil doar pentru tranzacții de Schimb." },
      { status: 400 },
    );
  }

  const doc = await prisma.transactionDocument.create({
    data: {
      transactionId: id,
      objectIndex,
      fileName: fileName || "document",
      fileUrl: blobUrl, // полный https URL Vercel Blob
      fileSize,
      mimeType: rawMime === "image/jpg" ? "image/jpeg" : rawMime,
    },
    select: { id: true, fileName: true, fileUrl: true, objectIndex: true, mimeType: true },
  });

  return NextResponse.json({ document: doc }, { status: 201 });
}
