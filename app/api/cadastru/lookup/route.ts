import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { lookupCadastru } from "@/lib/cadastru-service";
import { isDemoRequest } from "@/lib/demo-guard";
import { consumeUsage, usageBlockResponse } from "@/lib/usage";

// POST /api/cadastru/lookup { query } → запись/picker (200) или fallback «не найдено» (404).
export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  // Лимит тарифа: verificarea cadastrală (Basic 50 / Pro безлимит). Demo не считается.
  if (!(await isDemoRequest())) {
    const usage = await consumeUsage(sess.userId, "CADASTRU_CHECK");
    if (!usage.ok) return usageBlockResponse(usage, "CADASTRU_CHECK");
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query : "";

  const result = await lookupCadastru(query);
  if (result.status === "fallback") {
    return NextResponse.json(result, { status: 404 });
  }
  return NextResponse.json(result);
}
