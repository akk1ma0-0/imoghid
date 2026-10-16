import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { generateAgencyInviteCode, AgencyError } from "@/lib/agency";

// POST /api/agency/invite — владелец агентства генерирует одноразовый код-приглашение
// (привязан к его Agency, maxUses=1). Атомарная проверка свободного места (seatsPaid −
// memberships − активные коды) и создание — в generateAgencyInviteCode (lib/agency.ts),
// под блокировкой строки Agency, иначе параллельные клики создали бы лишние коды.
// Погашение (создание места + материализация HUB) — в /api/subscribe, не трогаем.
export async function POST() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  try {
    const created = await generateAgencyInviteCode(sess.userId);
    return NextResponse.json(created);
  } catch (e) {
    if (e instanceof AgencyError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("agency invite generate error:", e);
    return NextResponse.json({ error: "Eroare la generarea codului." }, { status: 500 });
  }
}
