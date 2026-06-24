import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { auth } from "@/auth";

const ALLOWED = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream", // некоторые браузеры так помечают .doc/.xls
];
const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

// POST /api/user-files/blob
// Авторизация прямой client-side загрузки личного документа в Vercel Blob.
export async function POST(request: Request) {
  const session = await auth();
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        if (!session?.user?.id) throw new Error("Neautentificat.");
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_SIZE,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Eroare la autorizarea încărcării.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
