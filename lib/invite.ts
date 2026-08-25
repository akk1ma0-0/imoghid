import type { Prisma, SubscriptionPlan } from "@prisma/client";

// Понятная ошибка валидации кода приглашения — её сообщение можно показать пользователю.
export class InviteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteError";
  }
}

/**
 * Проверяет код приглашения и инкрементирует usedCount.
 * Вызывать внутри транзакции (tx), чтобы создание пользователя / активация плана
 * и инкремент счётчика были атомарными.
 *
 * Возвращает план кода и agencyId (null для обычных кодов; задан для кодов агентства —
 * тогда вызывающий создаёт AgencyMembership вместо прямой активации плана).
 */
export async function redeemInvite(
  tx: Prisma.TransactionClient,
  code: string,
): Promise<{ plan: SubscriptionPlan; agencyId: string | null }> {
  const invite = await tx.inviteCode.findUnique({
    where: { code: code.trim() },
  });

  if (!invite || !invite.isActive) {
    throw new InviteError("Cod de invitație invalid.");
  }
  if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
    throw new InviteError("Codul de invitație a expirat.");
  }
  if (invite.usedCount >= invite.maxUses) {
    throw new InviteError("Codul de invitație a fost deja folosit.");
  }

  await tx.inviteCode.update({
    where: { id: invite.id },
    data: { usedCount: { increment: 1 } },
  });

  return { plan: invite.plan, agencyId: invite.agencyId };
}
