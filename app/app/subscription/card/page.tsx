import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getClientSubscription } from "@/lib/subscription-service";
import { RECURRING_CONSENT_VERSION } from "@/lib/recurring-consent";
import { CardChangeClient } from "./CardChangeClient";

// /app/subscription/card — смена карты подписки с автопродлением (CyberSource).
// Только владелец действующей подписки; остальных — в профиль.
export const dynamic = "force-dynamic";

export default async function CardChangePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const sub = await getClientSubscription(session.user.id);
  if (!sub || !sub.canChangeCard || !sub.amount || !sub.currency) redirect("/app/profile");
  return (
    <div className="ig-page" style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Schimbă cardul</h1>
      <CardChangeClient amount={sub.amount} currency={sub.currency} consentVersion={RECURRING_CONSENT_VERSION} />
    </div>
  );
}
