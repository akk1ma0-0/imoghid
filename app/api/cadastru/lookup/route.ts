import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { lookupCadastru } from "@/lib/cadastru-service";

// POST /api/cadastru/lookup { query } → запись/picker (200) или fallback «не найдено» (404).
export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query : "";

  const result = lookupCadastru(query);
  if (result.status === "fallback") {
    return NextResponse.json(result, { status: 404 });
  }
  return NextResponse.json(result);
}
