import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { agencyNextChargeAmount, findOwnAgencySubscription } from "@/lib/agency-subscription-service";
import { paymentCurrency } from "@/lib/payments";
import { RECURRING_CONSENT_VERSION } from "@/lib/recurring-consent";
import { CardChangeClient } from "@/app/app/subscription/card/CardChangeClient";

// /app/agency/card — смена карты агентской подписки с автопродлением (CyberSource).
// Только владелец агентства с такой подпиской; остальных — на страницу агентства.
export const dynamic = "force-dynamic";

export default async function AgencyCardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const sub = await findOwnAgencySubscription(session.user.id);
  if (!sub) redirect("/app/agency");
  const amount = await agencyNextChargeAmount(sub);
  if (!amount) redirect("/app/agency");
  return (
    <div className="ig-page" style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Schimbă cardul agenției</h1>
      <CardChangeClient
        amount={amount}
        currency={sub.currency ?? paymentCurrency()}
        consentVersion={RECURRING_CONSENT_VERSION}
        captureUrl="/api/agency/subscription/card/capture-context"
        backHref="/app/agency"
      />
    </div>
  );
}
