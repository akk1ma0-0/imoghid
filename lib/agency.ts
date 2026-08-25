import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// HUB/Agenție (Этап D). Период подписки агентства — 30 дней (как обычная подписка).
const AGENCY_PERIOD_DAYS = 30;

// Понятная ошибка операций с агентством (нет мест, уже в агентстве и т.п.) — показываем юзеру.
export class AgencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgencyError";
  }
}

// Клиент Prisma или транзакция — чтобы материализацию можно было вызвать внутри $transaction.
type Db = Prisma.TransactionClient;

// Материализует тариф HUB на пользователя при вступлении в агентство (выделении места):
// User.plan = HUB, активен. Личный planExpiresAt = null — истечение доступа участника
// управляется Agency.planExpiresAt через cron check-expired-agencies, а НЕ per-user
// check-expired-plans (тот пропускает planExpiresAt IS NULL). JWT-план освежается авто.
// (Механизм выделения места — Чекпоинт 2; функция готова заранее.)
export async function materializeAgencyPlan(userId: string, client: Db = prisma): Promise<void> {
  await client.user.update({
    where: { id: userId },
    data: { plan: "HUB", planActivatedAt: new Date(), planExpiresAt: null },
  });
}

// Снимает HUB при выходе из агентства / удалении места / истечении подписки агентства:
// User.plan = null + sessionVersion++ (мгновенный разлогин на всех устройствах). Данные
// пользователя (досье и пр.) НЕ трогаем — только доступ.
export async function dematerializeAgencyPlan(userId: string, client: Db = prisma): Promise<void> {
  await client.user.update({
    where: { id: userId },
    data: {
      plan: null,
      planActivatedAt: null,
      planExpiresAt: null,
      sessionVersion: { increment: 1 },
    },
  });
}

// Зачисление купленных мест владельцу (из vb-callback при PAID AGENCY_SEATS). Нет агентства
// → создать с seatsPaid=N (дефолтная цена); есть → seatsPaid += N. В обоих случаях продлеваем
// planExpiresAt = now + 30 дней (тот же цикл, что у обычной подписки). Возвращает агентство.
// Раздача мест участникам — отдельно (Чекпоинт 2), здесь только лицензии владельцу.
export async function creditAgencySeats(ownerId: string, seats: number) {
  const now = new Date();
  const planExpiresAt = new Date(now.getTime() + AGENCY_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const existing = await prisma.agency.findUnique({ where: { ownerId } });
  if (existing) {
    return prisma.agency.update({
      where: { id: existing.id },
      data: { seatsPaid: existing.seatsPaid + seats, planExpiresAt },
    });
  }
  return prisma.agency.create({
    data: { ownerId, seatsPaid: seats, planExpiresAt },
  });
}

// Отзыв доступа у участников агентств с истёкшим planExpiresAt (по аналогии с
// check-expired-plans, но по Agency.planExpiresAt): всем участникам с материализованным HUB
// сбрасываем план + sessionVersion++ (мгновенный разлогин). Сами Agency/AgencyMembership НЕ
// удаляем — история остаётся, доступ вернётся при продлении. Идемпотентно: фильтр plan=HUB
// не трогает уже сброшенных. Возвращает число отозванных участников.
export async function revokeExpiredAgencies(now: Date = new Date()): Promise<number> {
  const expired = await prisma.agency.findMany({
    where: { planExpiresAt: { lt: now } }, // { lt: now } уже исключает NULL
    select: { memberships: { select: { userId: true } } },
  });
  const userIds = expired.flatMap((a) => a.memberships.map((m) => m.userId));
  if (userIds.length === 0) return 0;
  const res = await prisma.user.updateMany({
    where: { id: { in: userIds }, plan: "HUB" },
    data: {
      plan: null,
      planActivatedAt: null,
      planExpiresAt: null,
      sessionVersion: { increment: 1 },
    },
  });
  return res.count;
}

// Присоединение пользователя к агентству по коду-инвайту (вызывается ВНУТРИ транзакции из
// /api/subscribe, чтобы вместе с погашением InviteCode быть атомарным). Проверяет: агентство
// активно, есть свободное место, пользователь ещё не в агентстве → создаёт membership + HUB.
export async function joinAgencyByInvite(
  tx: Db,
  userId: string,
  agencyId: string,
): Promise<void> {
  const agency = await tx.agency.findUnique({
    where: { id: agencyId },
    select: { seatsPaid: true, planExpiresAt: true, _count: { select: { memberships: true } } },
  });
  if (!agency) throw new AgencyError("Agenția nu mai există.");
  if (!agency.planExpiresAt || agency.planExpiresAt.getTime() <= Date.now()) {
    throw new AgencyError("Abonamentul agenției nu este activ.");
  }
  const existing = await tx.agencyMembership.findUnique({ where: { userId } });
  if (existing) throw new AgencyError("Sunteți deja membru al unei agenții.");
  if (agency._count.memberships >= agency.seatsPaid) {
    throw new AgencyError("Nu mai sunt locuri disponibile în agenție.");
  }
  await tx.agencyMembership.create({ data: { agencyId, userId, role: "MEMBER" } });
  await materializeAgencyPlan(userId, tx);
}

// Владелец убирает участника: удаляет membership и сбрасывает его план (HUB → null).
// Атомарно. Проверяет, что участник принадлежит именно этому агентству.
export async function removeAgencyMember(agencyId: string, memberUserId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const m = await tx.agencyMembership.findUnique({
      where: { userId: memberUserId },
      select: { id: true, agencyId: true },
    });
    if (!m || m.agencyId !== agencyId) {
      throw new AgencyError("Membru negăsit în această agenție.");
    }
    await tx.agencyMembership.delete({ where: { id: m.id } });
    await dematerializeAgencyPlan(memberUserId, tx);
  });
}

// Агентство владельца со сводкой (для UI /app/agency): места занято/всего + участники.
export async function getOwnedAgency(ownerId: string) {
  return prisma.agency.findUnique({
    where: { ownerId },
    select: {
      id: true,
      seatsPaid: true,
      pricePerSeatMdl: true,
      planExpiresAt: true,
      negotiated: true,
      memberships: {
        orderBy: { joinedAt: "asc" },
        select: {
          id: true,
          role: true,
          joinedAt: true,
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });
}
