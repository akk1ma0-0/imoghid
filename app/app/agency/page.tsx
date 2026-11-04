import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getOwnedAgency } from "@/lib/agency";
import { AGENCY_SEAT_FEE_MDL, AGENCY_MIN_SEATS } from "@/lib/plan-limits";
import { getAgencySubscriptionView } from "@/lib/agency-subscription-service";
import { AGENCY_SEATS_CONSENT_VERSION } from "@/lib/recurring-consent";
import { AgencyClient } from "./AgencyClient";

// /app/agency — управление агентством для владельца (места, участники, инвайты, докупка).
// Владелец получает доступ сюда даже без личного места (JWT-claim isAgencyOwner в middleware).
// Не-владелец видит форму покупки мест (минимум 3) — создаст агентство при оплате.
export const dynamic = "force-dynamic";

export default async function AgencyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const sp = await searchParams;

  const agency = await getOwnedAgency(session.user.id);
  // Подписка CyberSource с автопродлением (null — агентство VictoriaBank / созданное админом).
  const subscription = agency ? await getAgencySubscriptionView(session.user.id) : null;
  const data = agency
    ? {
        seatsPaid: agency.seatsPaid,
        pricePerSeatMdl: agency.pricePerSeatMdl,
        negotiated: agency.negotiated,
        planExpiresAt: agency.planExpiresAt?.toISOString() ?? null,
        members: agency.memberships.map((m) => ({
          userId: m.user.id,
          email: m.user.email,
          name: m.user.name,
          role: m.role,
          joinedAt: m.joinedAt.toISOString(),
        })),
        activeCodes: agency.inviteCodes.map((c) => ({
          id: c.id,
          code: c.code,
          createdAt: c.createdAt.toISOString(),
        })),
      }
    : null;

  return (
    <AgencyClient
      agency={data}
      feePerSeat={AGENCY_SEAT_FEE_MDL}
      minSeats={AGENCY_MIN_SEATS}
      currentUserId={session.user.id}
      subscription={subscription}
      seatsConsentVersion={AGENCY_SEATS_CONSENT_VERSION}
      cardUpdated={sp.card === "updated"}
    />
  );
}
