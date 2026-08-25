import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getOwnedAgency } from "@/lib/agency";
import { AGENCY_SEAT_FEE_MDL, AGENCY_MIN_SEATS } from "@/lib/plan-limits";
import { AgencyClient } from "./AgencyClient";

// /app/agency — управление агентством для владельца (места, участники, инвайты, докупка).
// Владелец получает доступ сюда даже без личного места (JWT-claim isAgencyOwner в middleware).
// Не-владелец видит форму покупки мест (минимум 3) — создаст агентство при оплате.
export default async function AgencyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const agency = await getOwnedAgency(session.user.id);
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
      }
    : null;

  return (
    <AgencyClient
      agency={data}
      feePerSeat={AGENCY_SEAT_FEE_MDL}
      minSeats={AGENCY_MIN_SEATS}
      currentUserId={session.user.id}
    />
  );
}
