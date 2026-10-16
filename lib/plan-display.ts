import { prisma } from "@/lib/prisma";

// Откуда у пользователя план — для отображения срока и действий (страница подписки, профиль):
//   personal     — личный Basic/Pro;
//   agencyMember — участник агентства (HUB выдан агентством, роль MEMBER);
//   agencyOwner  — владелец агентства (с местом или без);
//   admin        — ADMIN (смена плана не показывается).
export type PlanKind = "personal" | "agencyMember" | "agencyOwner" | "admin";

export type PlanDisplay = {
  plan: "BASIC" | "PRO" | "HUB" | null;
  kind: PlanKind;
  // Срок для строки «Activ până la …»: HUB по членству в агентстве — Agency.planExpiresAt
  // (у участника User.planExpiresAt = null, истечение — cron revokeExpiredAgencies);
  // иначе — User.planExpiresAt. null = срока нет («fără expirare»).
  expiresAt: string | null;
  // Срок агентства (участник / владелец) — для пояснений «Abonamentul agenției expiră la …».
  agencyExpiresAt: string | null;
};

// Единое правило «план + срок + роль» для /app/pending (PlanStatus) и /app/profile.
export async function getPlanDisplay(userId: string, role: string | undefined): Promise<PlanDisplay> {
  const [user, membership, ownedAgency] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planExpiresAt: true } }),
    prisma.agencyMembership.findUnique({
      where: { userId },
      select: { role: true, agency: { select: { planExpiresAt: true } } },
    }),
    prisma.agency.findUnique({ where: { ownerId: userId }, select: { planExpiresAt: true } }),
  ]);
  const plan = user?.plan ?? null;

  const kind: PlanKind =
    role === "ADMIN"
      ? "admin"
      : ownedAgency
        ? "agencyOwner"
        : membership?.role === "MEMBER"
          ? "agencyMember"
          : "personal";

  const viaAgency = plan === "HUB" && membership;
  const expires = viaAgency ? membership.agency.planExpiresAt : user?.planExpiresAt;
  const agencyExpires = membership?.agency.planExpiresAt ?? ownedAgency?.planExpiresAt ?? null;

  return {
    plan,
    kind,
    expiresAt: expires?.toISOString() ?? null,
    agencyExpiresAt: agencyExpires?.toISOString() ?? null,
  };
}
