import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getPlanDisplay } from "@/lib/plan-display";
import { getSingleAccessSummary } from "@/lib/usage";
import { emptySingleAccess } from "@/lib/single-access";
import { isWaitlistedFromEnv } from "@/lib/waitlist";
import { ProfilePanel } from "./ProfilePanel";

// /app/profile — только для авторизованных (плюс middleware уже защищает /app/*).
export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      agencyName: true,
      phone: true,
      plan: true,
      notifLegislatie: true,
    },
  });
  if (!user) redirect("/login");

  // План и срок — общее правило со страницей подписки (участник/владелец — срок агентства,
  // Basic/Pro — личный). Использование лимитов показывается на странице подписки.
  const display = await getPlanDisplay(session.user.id, session.user.role);

  // Без плана: разовые доступы («O accesare») и признак waitlist (прежний текст про
  // активацию администратором оставляем только тем, кто действительно ждёт приглашения).
  const noPlan = user.plan === null;
  const singleAccess = noPlan ? await getSingleAccessSummary(session.user.id) : emptySingleAccess();
  // Владелец агентства — платящий клиент, «ждите приглашение» ему не про него.
  const waitlisted = noPlan && !session.user.isAgencyOwner && isWaitlistedFromEnv({ role: session.user.role, email: user.email });

  return (
    <ProfilePanel
      initial={{
        name: user.name,
        email: user.email,
        agentie: user.agencyName ?? "",
        telefon: user.phone ?? "",
        plan: user.plan,
        notifLegislatie: user.notifLegislatie,
        planKind: display.kind,
        planExpiresAt: display.expiresAt,
        agencyExpiresAt: display.agencyExpiresAt,
        singleAccess,
        waitlisted,
      }}
    />
  );
}
