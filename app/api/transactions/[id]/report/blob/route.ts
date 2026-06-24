import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { auth } from "@/auth";
import { loadOwnedTransaction } from "@/lib/transaction-auth";

type Params = { params: Promise<{ id: string }> };

const ALLOWED = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

// POST /api/transactions/[id]/report/blob
// Авторизация прямой загрузки сгенерированного .docx «Fișa obiectului» в Vercel Blob.
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        if (!session?.user?.id) throw new Error("Neautentificat.");
        const tx = await loadOwnedTransaction(id, session.user.id);
        if (!tx) throw new Error("Tranzacție negăsită.");
        return { allowedContentTypes: ALLOWED, maximumSizeInBytes: MAX_SIZE, addRandomSuffix: true };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Eroare la autorizarea încărcării.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
