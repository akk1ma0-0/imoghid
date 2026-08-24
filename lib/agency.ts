import { prisma } from "@/lib/prisma";

// HUB/Agenție (Этап D). Период подписки агентства — 30 дней (как обычная подписка).
const AGENCY_PERIOD_DAYS = 30;

// Материализует тариф HUB на пользователя при вступлении в агентство (выделении места):
// User.plan = HUB, активен. Личный planExpiresAt = null — истечение доступа участника
// управляется Agency.planExpiresAt через cron check-expired-agencies, а НЕ per-user
// check-expired-plans (тот пропускает planExpiresAt IS NULL). JWT-план освежается авто.
// (Механизм выделения места — Чекпоинт 2; функция готова заранее.)
export async function materializeAgencyPlan(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { plan: "HUB", planActivatedAt: new Date(), planExpiresAt: null },
  });
}

// Снимает HUB при выходе из агентства / удалении места / истечении подписки агентства:
// User.plan = null + sessionVersion++ (мгновенный разлогин на всех устройствах). Данные
// пользователя (досье и пр.) НЕ трогаем — только доступ.
export async function dematerializeAgencyPlan(userId: string): Promise<void> {
  await prisma.user.update({
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
