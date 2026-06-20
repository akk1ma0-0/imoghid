import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { getCmaStats } from "@/lib/listings-service";

// GET /api/tools/cma — статистика CMA (демо-данные из lib/listings-mock.ts).
export async function GET() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const stats = await getCmaStats();
  return NextResponse.json(stats);
}
