import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { auth } from "@/auth";
import { loadOwnedTransaction } from "@/lib/transaction-auth";

type Params = { params: Promise<{ id: string }> };

const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

// POST /api/transactions/[id]/documents/blob
// Авторизация прямой client-side загрузки в Vercel Blob (обходит лимит тела функции).
// Сам файл идёт в Blob напрямую из браузера; здесь только выдаём подписанный токен.
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      // Проверяем права ТОЛЬКО на фазе генерации токена (запрос из браузера с куками).
      onBeforeGenerateToken: async () => {
        if (!session?.user?.id) throw new Error("Neautentificat.");
        const tx = await loadOwnedTransaction(id, session.user.id);
        if (!tx) throw new Error("Tranzacție negăsită.");
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_SIZE,
          addRandomSuffix: true,
        };
      },
      // Запись в БД создаётся клиентом после успешной загрузки (надёжно и локально, и в проде).
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Eroare la autorizarea încărcării.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
