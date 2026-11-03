import type { PaymentPurpose, SubscriptionPlan } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { isPayablePlan, PLAN_PRICING } from "@/lib/payments";
import { AGENCY_MIN_SEATS, AGENCY_SEAT_FEE_MDL } from "@/lib/plan-limits";
import { personalPlanPurchaseBlock } from "@/lib/agency";

// Что покупает пользователь и за сколько — только сервер решает сумму. Правила те же, что в
// vb-initiate / vb-agency-initiate (сами VB-роуты не меняются). Для CyberSource на этом шаге —
// только платежи с автопродлением: подписка Basic/Pro и НОВОЕ агентство (докупка мест к
// существующему агентству пока идёт через VictoriaBank).
export type PaymentIntent = {
  purpose: Extract<PaymentPurpose, "SUBSCRIPTION" | "AGENCY_SEATS">;
  plan: SubscriptionPlan;
  seats: number | null;
  ownerTakesSeat: boolean;
  amount: number; // MDL
  description: string;
};

export type IntentResult = { ok: true; intent: PaymentIntent } | { ok: false; status: number; message: string };

export async function resolvePaymentIntent(
  userId: string,
  input: { purpose?: unknown; plan?: unknown; seats?: unknown; takeOwnerSeat?: unknown },
): Promise<IntentResult> {
  if (input.purpose === "SUBSCRIPTION") {
    if (!isPayablePlan(input.plan)) return { ok: false, status: 400, message: "Plan invalid." };
    const block = await personalPlanPurchaseBlock(userId);
    if (block) return { ok: false, status: 409, message: block };
    return {
      ok: true,
      intent: {
        purpose: "SUBSCRIPTION",
        plan: input.plan,
        seats: null,
        ownerTakesSeat: false,
        amount: PLAN_PRICING[input.plan].amount,
        description: `Abonament ImoGhid ${PLAN_PRICING[input.plan].label}`,
      },
    };
  }
  if (input.purpose === "AGENCY_SEATS") {
    const seats = Number(input.seats);
    const existing = await prisma.agency.findUnique({ where: { ownerId: userId }, select: { id: true } });
    if (existing) {
      return { ok: false, status: 409, message: "Suplimentarea locurilor se face deocamdată prin plata obișnuită." };
    }
    if (!Number.isInteger(seats) || seats < AGENCY_MIN_SEATS) {
      return { ok: false, status: 400, message: `Un pachet HUB/Agenție începe de la ${AGENCY_MIN_SEATS} locuri.` };
    }
    return {
      ok: true,
      intent: {
        purpose: "AGENCY_SEATS",
        plan: "HUB",
        seats,
        ownerTakesSeat: input.takeOwnerSeat === true || input.takeOwnerSeat === "true",
        amount: seats * AGENCY_SEAT_FEE_MDL,
        description: `HUB/Agenție — ${seats} locuri (ImoGhid)`,
      },
    };
  }
  return { ok: false, status: 400, message: "Tip de plată invalid." };
}
