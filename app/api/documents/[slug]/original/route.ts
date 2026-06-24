import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { getActeTemplate, readOriginalBuffer, mimeOf } from "@/lib/acte-templates";

type Params = { params: Promise<{ slug: string }> };

// GET /api/documents/[slug]/original
// Отдаёт сырые байты оригинального шаблона из docs/templates/ — для визуального
// просмотра на клиенте (docx-preview). Доступ только авторизованным.
export async function GET(req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { slug } = await params;

  const tpl = getActeTemplate(slug);
  if (!tpl) return NextResponse.json({ error: "Document negăsit." }, { status: 404 });

  try {
    const buf = readOriginalBuffer(tpl);
    const headers: Record<string, string> = {
      "Content-Type": mimeOf(tpl),
      "Cache-Control": "private, no-store",
    };
    // ?download=1 → принудительное скачивание с оригинальным именем файла.
    if (new URL(req.url).searchParams.get("download")) {
      const name = tpl.file.replace(/\s+/g, "_");
      const asciiName = name.replace(/[^\x20-\x7E]/g, "_");
      headers["Content-Disposition"] =
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`;
    }
    return new NextResponse(new Uint8Array(buf), { status: 200, headers });
  } catch (err) {
    console.error("[documents/original] eroare la citire:", err);
    return NextResponse.json({ error: "Nu s-a putut încărca șablonul." }, { status: 500 });
  }
}
