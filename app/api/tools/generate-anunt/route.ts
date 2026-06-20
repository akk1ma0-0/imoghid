import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { generateAnunt } from "@/lib/tools-claude";

// POST /api/tools/generate-anunt { input, lang } → текст объявления (Claude).
// В Claude уходит ТОЛЬКО кешированный системный промпт + тезисы (без шаблонов/сделок/ExtractedField).
export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }
  const input = typeof body.input === "string" ? body.input.trim() : "";
  const lang = body.lang === "ru" ? "ru" : "ro";
  if (!input) {
    return NextResponse.json({ error: "Introduceți caracteristicile obiectului." }, { status: 400 });
  }

  const text = await generateAnunt(input, lang);
  return NextResponse.json({ text });
}
