import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { requireSession, loadOwnedTransaction, notFound } from "@/lib/transaction-auth";

type Params = { params: Promise<{ id: string }> };

const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
}

// POST /api/transactions/[id]/documents — multipart загрузка файлов в /public/uploads/[id]/.
export async function POST(request: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { id } = await params;

  const tx = await loadOwnedTransaction(id, sess.userId);
  if (!tx) return notFound();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Așteptat multipart/form-data." }, { status: 400 });
  }

  const objectIndexRaw = form.get("objectIndex");
  let objectIndex = 1;
  if (typeof objectIndexRaw === "string" && (objectIndexRaw === "1" || objectIndexRaw === "2")) {
    objectIndex = Number(objectIndexRaw);
  }
  if (objectIndex === 2 && tx.dealType !== "SCHIMB") {
    return NextResponse.json(
      { error: "Obiectul 2 este valabil doar pentru tranzacții de Schimb." },
      { status: 400 },
    );
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Niciun fișier încărcat." }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "public", "uploads", id);
  await mkdir(dir, { recursive: true });

  const created = [];
  for (const file of files) {
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: `Format neacceptat: ${file.name} (doar PDF, JPG, PNG).` },
        { status: 400 },
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `Fișier prea mare: ${file.name} (max 20 MB).` },
        { status: 400 },
      );
    }
    const stored = `${randomUUID()}-${safeName(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, stored), buffer);

    const doc = await prisma.transactionDocument.create({
      data: {
        transactionId: id,
        objectIndex,
        fileName: file.name,
        fileUrl: `/uploads/${id}/${stored}`,
        fileSize: file.size,
        mimeType: file.type === "image/jpg" ? "image/jpeg" : file.type,
      },
      select: { id: true, fileName: true, fileUrl: true, objectIndex: true, mimeType: true },
    });
    created.push(doc);
  }

  return NextResponse.json({ documents: created }, { status: 201 });
}
