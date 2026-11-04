import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { paymentCurrency } from "@/lib/payments";
import { isCyberSourceEnabledFor } from "@/lib/payment-provider";
import { resolvePaymentIntent } from "@/lib/payment-intent";
import { AGENCY_TOPUP_CONSENT_VERSION, agencyTopupConsentText, RECURRING_CONSENT_VERSION } from "@/lib/recurring-consent";
import { hasOwnAgencyCsSubscription } from "@/lib/agency-subscription-service";
import { checkPersonalCheckout, hasOwnCsSubscription } from "@/lib/plan-change-service";
import { fmtDateChisinau } from "@/lib/date-chisinau";
import { CheckoutClient } from "./CheckoutClient";

// /app/checkout — первая оплата с сохранением карты (CyberSource Unified Checkout).
// Доступна только тем, кому /api/payments/start открыл CyberSource; остальных — на тарифы.
// Сумма считается на сервере (та же логика, что в capture-context) — клиенту только для текста.
export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true, role: true } });
  if (!user) redirect("/app/pending");
  // Владелец подписки CyberSource меняет план здесь же, даже если его нет в бета-списке.
  if (!isCyberSourceEnabledFor(user) && !(await hasOwnCsSubscription(session.user.id)) && !(await hasOwnAgencyCsSubscription(session.user.id))) {
    redirect("/app/pending");
  }

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const input = {
    purpose: one(sp.purpose),
    plan: one(sp.plan),
    seats: one(sp.seats),
    takeOwnerSeat: one(sp.takeOwnerSeat),
  };
  const intentRes = await resolvePaymentIntent(session.user.id, input);
  // Личный план при подписке CyberSource: Basic → Pro — замена подписки; остальное — отказ сразу,
  // а не после ввода карты (та же проверка, что в capture context).
  const planCheck =
    intentRes.ok && intentRes.intent.purpose === "SUBSCRIPTION" ? await checkPersonalCheckout(session.user.id, intentRes.intent.plan) : null;
  const resolved = planCheck && !planCheck.ok ? planCheck : intentRes;
  const upgradeFrom = planCheck?.ok ? planCheck.upgradeFrom : null;
  const topup = resolved.ok ? resolved.intent.topup ?? null : null;
  const isAgency = input.purpose === "AGENCY_SEATS" || input.purpose === "AGENCY_TOPUP";
  const currency = paymentCurrency();

  return (
    <div className="ig-page" style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Plată cu cardul</h1>
      {resolved.ok && upgradeFrom && (
        <div className="notice amber" style={{ marginTop: 12, marginBottom: 4 }}>
          <div className="notice-dot" />
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>
            <b>
              Se va efectua acum o plată de {resolved.intent.amount} {paymentCurrency()}, iar perioada nouă începe astăzi.
              Suma plătită pentru Basic nu se returnează.
            </b>
            <div style={{ marginTop: 4, color: "var(--ink2)" }}>
              Abonamentul Basic (plătit până la {fmtDateChisinau(upgradeFrom.paidUntil.toISOString())}) se închide imediat
              după plată, iar cardul nou introdus va fi folosit pentru plățile lunare următoare.
            </div>
          </div>
        </div>
      )}
      {resolved.ok && topup && (
        <div className="notice blue" style={{ marginTop: 12, marginBottom: 4 }}>
          <div className="notice-dot" />
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>
            <b>
              Acum plătiți {resolved.intent.amount.toFixed(2)} {currency} — doar pentru zilele rămase până la{" "}
              {fmtDateChisinau(topup.paidUntil.toISOString())}.
            </b>
            <div style={{ marginTop: 4, color: "var(--ink2)" }}>
              Locurile noi sunt disponibile imediat după plată. Începând cu {fmtDateChisinau(topup.paidUntil.toISOString())}, plata
              lunară devine {topup.monthlyAmount} {currency} pentru {topup.newSeats} locuri. Cardul introdus acum va fi folosit
              pentru plățile lunare următoare.
            </div>
          </div>
        </div>
      )}
      {resolved.ok ? (
        <CheckoutClient
          intent={{
            purpose: resolved.intent.purpose,
            plan: resolved.intent.plan,
            seats: resolved.intent.seats,
            takeOwnerSeat: resolved.intent.ownerTakesSeat,
          }}
          description={resolved.intent.description}
          amount={resolved.intent.amount.toFixed(2)}
          currency={paymentCurrency()}
          consentVersion={topup ? AGENCY_TOPUP_CONSENT_VERSION : RECURRING_CONSENT_VERSION}
          priceLine={
            topup
              ? `acum ${resolved.intent.amount.toFixed(2)} ${currency}, apoi ${topup.monthlyAmount} ${currency} / lună`
              : undefined
          }
          consentText={
            topup ? agencyTopupConsentText(resolved.intent.amount.toFixed(2), topup.monthlyAmount, currency, topup.newSeats) : undefined
          }
          backHref={isAgency ? "/app/agency" : undefined}
        />
      ) : (
        <div className="notice amber" style={{ marginTop: 16 }}>
          <div className="notice-dot" />
          <div>
            <b>{resolved.message}</b>
            <p style={{ margin: "4px 0 0" }}>
              <a href={isAgency ? "/app/agency" : "/app/pending"}>{isAgency ? "← Înapoi la agenție" : "← Înapoi la abonament"}</a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
