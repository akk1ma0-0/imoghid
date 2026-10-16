import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { leaveAgency, AgencyError } from "@/lib/agency";

// POST /api/agency/leave — участник сам выходит из агентства: удаляется его membership (место
// освобождается), план сбрасывается до «без плана». Владелец выйти не может (400).
// Идемпотентно: повторный вызов → 200 { ok: true, left: false }. Логика — leaveAgency (lib/agency.ts).
export async function POST() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  try {
    const { left } = await leaveAgency(sess.userId);
    return NextResponse.json({ ok: true, left });
  } catch (e) {
    if (e instanceof AgencyError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("agency leave error:", e);
    return NextResponse.json({ error: "Nu s-a putut părăsi agenția." }, { status: 500 });
  }
}
