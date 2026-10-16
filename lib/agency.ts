import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// HUB/Agenție (Этап D). Период подписки агентства — 30 дней (как обычная подписка).
const AGENCY_PERIOD_DAYS = 30;

// Понятная ошибка операций с агентством (нет мест, уже в агентстве и т.п.) — показываем юзеру.
// status — необязательный HTTP-код для роута (по умолчанию 400, как было раньше); добавлен
// аддитивно — существующие throw new AgencyError("...") без status продолжают давать 400
// (joinAgencyByInvite/removeAgencyMember не трогал).
export class AgencyError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AgencyError";
    this.status = status;
  }
}

// Код агентства считается «активным» (резервирует место), если: isActive, не использован и не
// истёк. Коды агентства всегда создаются с maxUses=1 (см. generateAgencyInviteCode) → сравнение
// usedCount<maxUses эквивалентно usedCount===0 для этого подмножества кодов (без cross-column
// фильтра Prisma/raw SQL). Без agencyId — для вложенного relation-фильтра (agencyId там уже
// подразумевается связью); для верхнеуровневого tx.inviteCode.count добавляем agencyId отдельно.
function activeInviteCodeFilter(now: Date = new Date()): Prisma.InviteCodeWhereInput {
  return {
    isActive: true,
    usedCount: 0,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

// Участник агентства (роль MEMBER) не покупает личный план: иначе callback выдал бы BASIC/PRO
// при сохранённом месте в агентстве (рассинхрон). Владелец (OWNER) этим не ограничивается.
export const AGENCY_MEMBER_PURCHASE_BLOCK_MSG =
  "Faceți parte dintr-o agenție. Pentru a cumpăra un plan personal, ieșiți mai întâi din agenție " +
  "(pagina Abonament → Schimbați planul).";

export async function isAgencyMember(userId: string): Promise<boolean> {
  const m = await prisma.agencyMembership.findUnique({ where: { userId }, select: { role: true } });
  return m?.role === "MEMBER";
}

// Владелец не покупает личный Basic/Pro, только если личный Basic/Pro заменил бы его HUB:
// (1) он сам занял место в своём агентстве (есть его AgencyMembership → у него материализован
// HUB-план) И (2) подписка агентства не истекла (planExpiresAt в будущем; null = не оплачено,
// тоже не блок). Владельцу без своего места или при истёкшей подписке агентства личный план
// разрешён. Покупка/докупка мест, HUB и «O accesare» этим не ограничиваются.
export const AGENCY_OWNER_PURCHASE_BLOCK_MSG =
  "Sunteți proprietarul unei agenții active. Un plan personal ar înlocui planul HUB.";

export async function isActiveAgencyOwner(userId: string): Promise<boolean> {
  const a = await prisma.agency.findUnique({
    where: { ownerId: userId },
    select: { planExpiresAt: true, memberships: { where: { userId }, select: { id: true } } },
  });
  if (!a) return false;
  const holdsOwnSeat = a.memberships.length > 0;
  const subscriptionActive = !!a.planExpiresAt && a.planExpiresAt.getTime() > Date.now();
  return holdsOwnSeat && subscriptionActive;
}

// Блок покупки личного плана (Basic/Pro) — текст причины или null, если покупка разрешена.
export async function personalPlanPurchaseBlock(userId: string): Promise<string | null> {
  if (await isAgencyMember(userId)) return AGENCY_MEMBER_PURCHASE_BLOCK_MSG;
  if (await isActiveAgencyOwner(userId)) return AGENCY_OWNER_PURCHASE_BLOCK_MSG;
  return null;
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
export async function creditAgencySeats(ownerId: string, seats: number, client: Db = prisma) {
  const now = new Date();
  const planExpiresAt = new Date(now.getTime() + AGENCY_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const existing = await client.agency.findUnique({ where: { ownerId } });
  if (existing) {
    return client.agency.update({
      where: { id: existing.id },
      data: { seatsPaid: existing.seatsPaid + seats, planExpiresAt },
    });
  }
  return client.agency.create({
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

// Алфавит без похожих символов — как было в app/api/agency/invite/route.ts.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genInviteCode(): string {
  const bytes = crypto.randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `AG-${s}`;
}

// Генерация кода-приглашения владельцем. Атомарно проверяет свободное место и создаёт код
// в ОДНОЙ транзакции с блокировкой строки Agency (SELECT ... FOR UPDATE), иначе два быстрых
// клика (или два параллельных запроса) оба прочли бы одно и то же "свободное место" до того,
// как любой из них закоммитил INSERT (TOCTOU), и создали бы код сверх лимита. Явная блокировка
// строки проще для рассуждения, чем SERIALIZABLE isolation с ретраями по всему приложению —
// выбран этот вариант.
// Свободные места = seatsPaid − occupied(memberships) − reserved(активные коды).
export async function generateAgencyInviteCode(
  ownerId: string,
): Promise<{ id: string; code: string; createdAt: Date }> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string; seatsPaid: number; planExpiresAt: Date | null }[]
    >`SELECT "id", "seatsPaid", "planExpiresAt" FROM "agencies" WHERE "ownerId" = ${ownerId} FOR UPDATE`;
    const agency = rows[0];
    if (!agency) {
      throw new AgencyError("Nu dețineți o agenție. Cumpărați locuri mai întâi.", 400);
    }
    if (!agency.planExpiresAt || agency.planExpiresAt.getTime() <= Date.now()) {
      throw new AgencyError("Abonamentul agenției a expirat.", 409);
    }

    const [occupied, reserved] = await Promise.all([
      tx.agencyMembership.count({ where: { agencyId: agency.id } }),
      tx.inviteCode.count({ where: { agencyId: agency.id, ...activeInviteCodeFilter() } }),
    ]);
    const free = agency.seatsPaid - occupied - reserved;
    if (free <= 0) {
      throw new AgencyError(
        "Nu mai sunt locuri libere. Toate locurile sunt ocupate sau rezervate prin coduri active. " +
          "Cumpărați locuri suplimentare sau anulați un cod neutilizat.",
        409,
      );
    }

    let code = genInviteCode();
    for (let i = 0; i < 2; i++) {
      try {
        return await tx.inviteCode.create({
          data: { code, plan: "HUB", createdById: ownerId, agencyId: agency.id, maxUses: 1 },
          select: { id: true, code: true, createdAt: true },
        });
      } catch {
        if (i === 1) throw new AgencyError("Eroare la generarea codului.", 500);
        code = genInviteCode();
      }
    }
    // Недостижимо (цикл выше либо возвращает, либо бросает), но TS требует явного возврата.
    throw new AgencyError("Eroare la generarea codului.", 500);
  });
}

// Отмена неиспользованного кода владельцем. Один атомарный deleteMany (id + agencyId
// владельца + usedCount:0 в одном WHERE) — без отдельной транзакции: проверка владения и
// «не использован» — часть того же SQL-запроса, что и удаление.
export async function cancelAgencyInviteCode(ownerId: string, codeId: string): Promise<void> {
  const agency = await prisma.agency.findUnique({ where: { ownerId }, select: { id: true } });
  if (!agency) throw new AgencyError("Nu dețineți o agenție.", 400);

  const res = await prisma.inviteCode.deleteMany({
    where: { id: codeId, agencyId: agency.id, usedCount: 0 },
  });
  if (res.count === 0) {
    throw new AgencyError("Codul nu a fost găsit sau a fost deja folosit.", 404);
  }
}

// Участник сам выходит из агентства. Атомарно: удаляем его membership (место освобождается —
// occupied = memberships.count) и сбрасываем план до «без плана» теми же полями, что
// revokeExpiredAgencies/dematerializeAgencyPlan (plan/planActivatedAt/planExpiresAt = null,
// только если план был HUB). НО без sessionVersion++: тот разлогинивает на всех устройствах,
// включая текущее, а после добровольного выхода клиент обновляет сессию и остаётся на
// /app/pending. Безопасность не страдает: серверные проверки (auth.ts jwt-wrapper,
// consumeUsage, requirePaidAccess) читают план из БД на каждом запросе.
// Владелец выйти не может (400). Идемпотентно: нет membership → { left: false }, без ошибки
// (deleteMany вместо delete — повторный/параллельный вызов не падает на P2025).
// Данные пользователя (досье, документы, объекты, счётчики) не трогаем.
export async function leaveAgency(userId: string): Promise<{ left: boolean }> {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.agency.findUnique({ where: { ownerId: userId }, select: { id: true } });
    if (owned) throw new AgencyError("Proprietarul nu poate părăsi agenția", 400);

    const del = await tx.agencyMembership.deleteMany({ where: { userId } });
    if (del.count === 0) return { left: false };

    await tx.user.updateMany({
      where: { id: userId, plan: "HUB" },
      data: { plan: null, planActivatedAt: null, planExpiresAt: null },
    });
    return { left: true };
  });
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

// Агентство владельца со сводкой (для UI /app/agency): места занято/всего + участники +
// активные (неиспользованные, неистёкшие) коды-приглашения — список приходит с сервера при
// каждой загрузке страницы, поэтому после обновления страницы сгенерированные коды не теряются.
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
      inviteCodes: {
        where: activeInviteCodeFilter(),
        orderBy: { createdAt: "desc" },
        select: { id: true, code: true, createdAt: true },
      },
    },
  });
}
