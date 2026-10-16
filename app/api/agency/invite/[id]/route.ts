import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { cancelAgencyInviteCode, AgencyError } from "@/lib/agency";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/agency/invite/[id] — владелец отменяет неиспользованный код своей агентства.
// Проверка владения + «не использован» — атомарный deleteMany в cancelAgencyInviteCode
// (lib/agency.ts). Освобождает зарезервированное этим кодом место.
export async function DELETE(_req: Request, { params }: Params) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  const { id } = await params;
  try {
    await cancelAgencyInviteCode(sess.userId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AgencyError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("agency invite cancel error:", e);
    return NextResponse.json({ error: "Eroare la anularea codului." }, { status: 500 });
  }
}
