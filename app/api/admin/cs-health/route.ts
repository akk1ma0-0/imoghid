import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { csHealthCheck } from "@/lib/cybersource/health";

// GET /api/admin/cs-health — проверка соединения с CyberSource (только ADMIN).
// Платёж не создаётся; в ответе только ok, среда и HTTP-коды проверок — без ключей и тел.
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  const health = await csHealthCheck();
  return NextResponse.json(health, { status: health.ok ? 200 : 502 });
}
