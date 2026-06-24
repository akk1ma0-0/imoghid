import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { getActeTemplate, loadOriginalSheets } from "@/lib/acte-templates";

type Params = { params: Promise<{ slug: string }> };

// GET /api/documents/[slug]/cells
// Возвращает листы оригинального .xlsx со стилями ячеек (цвет/фон/жирность/границы)
// для визуального рендера на клиенте. Только для xlsx-шаблонов, только оригинал.
export async function GET(_req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const { slug } = await params;

  const tpl = getActeTemplate(slug);
  if (!tpl) return NextResponse.json({ error: "Document negăsit." }, { status: 404 });
  if (tpl.type !== "xlsx") {
    return NextResponse.json({ error: "Doar pentru fișiere Excel." }, { status: 400 });
  }

  try {
    const sheets = await loadOriginalSheets(tpl);
    return NextResponse.json({ sheets });
  } catch (err) {
    console.error("[documents/cells] eroare la citire:", err);
    return NextResponse.json({ error: "Nu s-a putut încărca foaia de calcul." }, { status: 500 });
  }
}
