import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getPlanDisplay } from "@/lib/plan-display";
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
      }}
    />
  );
}
