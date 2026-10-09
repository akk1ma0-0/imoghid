import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { isDemoRequest } from "@/lib/demo-guard";
import { usageBlockResponse } from "@/lib/usage";
import { CAD_ERROR_STATUS } from "@/lib/cadastru-config";
import { runCadastruLookup } from "@/lib/cadastru-lookup";

// POST /api/cadastru/lookup { query }
//   200 { status: "record" | "picker", … }
//   400 INVALID_FORMAT · 404 NOT_FOUND · 502 UPSTREAM_ERROR · 503 UNREACHABLE · 504 TIMEOUT
//     → { status: "error", code, title, text }
//   402 / 403 / 429 — лимит тарифа (usageBlockResponse).
// Лимит резервируется только перед реальным вызовом кадастра и возвращается при неудаче
// (lib/cadastru-lookup.ts). Невалидное тело/ввод ничего не списывает.
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

  const outcome = await runCadastruLookup({
    userId: sess.userId,
    query,
    isDemo: await isDemoRequest(),
  });

  switch (outcome.kind) {
    case "record":
      return NextResponse.json({
        status: "record",
        cadastralNo: outcome.cadastralNo,
        record: outcome.record,
        trace: outcome.trace,
      });
    case "picker":
      return NextResponse.json({
        status: "picker",
        building: outcome.building,
        note: outcome.note,
        trace: outcome.trace,
      });
    case "blocked":
      return usageBlockResponse(outcome.usage, "CADASTRU_CHECK");
    case "error":
      return NextResponse.json(
        { status: "error", code: outcome.code, title: outcome.title, text: outcome.text },
        { status: CAD_ERROR_STATUS[outcome.code] },
      );
  }
}
