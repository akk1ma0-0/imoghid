import type { PaymentPurpose, SubscriptionPlan, UsageFeature } from "@prisma/client";

// Описание услуги платежа: одна функция для квитанции (buildReceipt) и для Payment.description
// (запись транзакции по договору с банком). Тексты — на румынском, как в чеке.
const OVERAGE_SERVICE_RO: Record<string, string> = {
  DOSAR_ANALYSIS: "Supra-limit — examinarea dosarului",
  CADASTRU_CHECK: "Supra-limit — verificarea cadastrală",
};

export function planLabelRo(plan: SubscriptionPlan): string {
  return plan === "PRO" ? "Plan Pro" : plan === "HUB" ? "HUB/Agenție" : "Plan Basic";
}

export type DescriptionInput = {
  plan: SubscriptionPlan;
  purpose?: PaymentPurpose | null;
  seats?: number | null;
  overageFeature?: UsageFeature | null;
  // true — проверка карты на 0.00 (смена карты): отдельной purpose у неё нет.
  cardVerification?: boolean;
};

export function paymentDescription(d: DescriptionInput): string {
  if (d.cardVerification) return "Verificare card (0.00) — schimbarea cardului ImoGhid";
  const planLabel = planLabelRo(d.plan);
  switch (d.purpose) {
    case "AGENCY_SEATS":
      return `HUB/Agenție — ${d.seats ?? 0} locuri`;
    case "AGENCY_TOPUP":
      return `HUB/Agenție — ${d.seats ?? 0} ${d.seats === 1 ? "loc adăugat" : "locuri adăugate"} (perioada rămasă)`;
    case "SINGLE_ACCESS":
      return "O accesare — acces unic (1 verificare + 1 dosar + 1 obiect)";
    case "OVERAGE":
      return d.overageFeature
        ? `${OVERAGE_SERVICE_RO[d.overageFeature] ?? "Supra-limit ImoGhid"} (${planLabel})`
        : `Abonament ImoGhid — ${planLabel}`;
    default:
      return `Abonament ImoGhid — ${planLabel}`;
  }
}
