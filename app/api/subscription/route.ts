import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { getClientSubscription } from "@/lib/subscription-service";

// GET /api/subscription — подписка CyberSource текущего пользователя (только своя).
// Без токенов, кодов банка и внутренних пометок. null — подписки с автопродлением нет
// (в т.ч. у клиентов VictoriaBank: их интерфейс не меняется).
export const dynamic = "force-dynamic";

export async function GET() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  return NextResponse.json({ subscription: await getClientSubscription(sess.userId) });
}
