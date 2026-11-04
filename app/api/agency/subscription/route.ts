import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { getAgencySubscriptionView } from "@/lib/agency-subscription-service";

// GET /api/agency/subscription — агентская подписка CyberSource текущего владельца (только своя).
// null — подписки с автопродлением нет (в т.ч. агентства VictoriaBank: их интерфейс не меняется).
export const dynamic = "force-dynamic";

export async function GET() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  return NextResponse.json({ subscription: await getAgencySubscriptionView(sess.userId) });
}
