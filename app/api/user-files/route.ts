import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXT = /\.(pdf|docx?|xlsx?)$/i;

// GET /api/user-files — личные документы пользователя (новые сверху).
export async function GET() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  const files = await prisma.userFile.findMany({
    where: { userId: sess.userId },
    orderBy: { uploadedAt: "desc" },
  });
  return NextResponse.json({ files });
}

// POST /api/user-files — метаданные файла, уже загруженного в Blob (см. /blob).
export async function POST(req: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const blobUrl = typeof body.blobUrl === "string" ? body.blobUrl : "";
  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 255) : "";
  const fileSize = typeof body.fileSize === "number" ? body.fileSize : 0;
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "application/octet-stream";

  if (!/^https:\/\//.test(blobUrl)) {
    return NextResponse.json({ error: "URL fișier invalid." }, { status: 400 });
  }
  if (!fileName || !ALLOWED_EXT.test(fileName)) {
    return NextResponse.json(
      { error: "Format neacceptat (doar PDF, DOC, DOCX, XLS, XLSX)." },
      { status: 400 },
    );
  }
  if (fileSize > MAX_SIZE) {
    return NextResponse.json({ error: "Fișier prea mare (max 15 MB)." }, { status: 400 });
  }

  const file = await prisma.userFile.create({
    data: { userId: sess.userId, fileName, blobUrl, fileSize, mimeType },
  });
  return NextResponse.json({ file });
}
