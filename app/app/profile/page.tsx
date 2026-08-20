import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUsage } from "@/lib/usage";
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

  // Использование анализов дела за расчётный период (DOSAR_ANALYSIS) — из UsageCounter.
  const { used, limit } = await getUsage(session.user.id, "DOSAR_ANALYSIS");

  return (
    <ProfilePanel
      initial={{
        name: user.name,
        email: user.email,
        agentie: user.agencyName ?? "",
        telefon: user.phone ?? "",
        plan: user.plan,
        notifLegislatie: user.notifLegislatie,
        usageUsed: used,
        usageLimit: limit,
      }}
    />
  );
}
