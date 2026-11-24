import { del } from "@vercel/blob";

import { releaseHubUsers } from "@/lib/agency";
import { retirePaymentMethod, type TmsDeleter } from "@/lib/cybersource/token-retire";
import { prisma } from "@/lib/prisma";

export type DeleteUserResult = { ok: true } | { ok: false; status: 409 | 503; message: string };

// Платёж CyberSource «в пути» (идёт автосписание или клиент сейчас на оплате) — удаление ждёт:
// иначе деньги могли бы списаться уже после удаления аккаунта. Окно — как у перехода Basic → Pro.
export const DELETE_IN_FLIGHT_WINDOW_MS = 60 * 60 * 1000;
export const DELETE_HOLD = "ACCOUNT_DELETION";

const MSG_PAYMENT_IN_FLIGHT = "O plată este în curs de procesare. Încercați din nou peste o oră.";
const MSG_TOKEN_FAILED =
  "Nu am putut finaliza ștergerea contului. Abonamentul a fost oprit și nu vor mai avea loc debitări. Încercați din nou peste câteva minute.";

async function hasPaymentInFlight(userId: string, now: Date): Promise<boolean> {
  const n = await prisma.payment.count({
    where: {
      provider: "CYBERSOURCE",
      status: { in: ["PENDING", "UNKNOWN"] },
      createdAt: { gt: new Date(now.getTime() - DELETE_IN_FLIGHT_WINDOW_MS) },
      OR: [{ userId }, { subscription: { userId } }],
    },
  });
  return n > 0;
}

// Закрыть все подписки CyberSource пользователя (личные и агентские) без возврата денег:
// CANCELED без cancelAtPeriodEnd — биллинг такие не выбирает (ни списаний, ни писем, ни
// expire). billingHold = ACCOUNT_DELETION — след для разбора и маркер незавершённого удаления.
// Повторный вызов ничего не меняет.
async function closeCyberSourceSubscriptions(userId: string, now: Date): Promise<void> {
  await prisma.$transaction(async (db) => {
    const subs = await db.subscription.findMany({
      where: { userId, provider: "CYBERSOURCE", status: { in: ["ACTIVE", "PAST_DUE", "CANCELED"] } },
      select: { id: true, canceledAt: true },
    });
    for (const sub of subs) {
      await db.subscription.update({
        where: { id: sub.id },
        data: {
          status: "CANCELED",
          cancelAtPeriodEnd: false,
          canceledAt: sub.canceledAt ?? now,
          nextChargeAt: null,
          graceEndsAt: null,
          billingHold: DELETE_HOLD,
          pendingPlan: null,
          pendingAmount: null,
          pendingFrom: null,
          pendingSetAt: null,
          pendingSeats: null,
        },
      });
    }
  });
}

// Удалить у банка все активные токены карт пользователя (token-retire: TMS DELETE, 204/404/410 —
// успех; запись PaymentOperation TOKEN_DELETE; карта → REMOVED). Возвращает id карт с ошибкой.
async function retireAllPaymentMethods(userId: string, now: Date, tms?: TmsDeleter): Promise<string[]> {
  const pms = await prisma.paymentMethod.findMany({
    where: { userId, provider: "CYBERSOURCE", status: "ACTIVE" },
    select: { id: true },
  });
  const failed: string[] = [];
  for (const pm of pms) {
    const lastPayment = await prisma.payment.findFirst({
      where: { provider: "CYBERSOURCE", OR: [{ subscription: { paymentMethodId: pm.id } }, { userId }] },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const r = await retirePaymentMethod({ paymentMethodId: pm.id, paymentId: lastPayment?.id ?? null, actorUserId: userId, now, tms });
    if (r === "error" || r === "in_use") failed.push(pm.id);
  }
  return failed;
}

// Полное удаление пользователя и всех его данных в FK-безопасном порядке.
// Используется и self-delete (/api/user), и admin-delete (/api/admin/users/[id]).
//
// onDelete по схеме для связей на User:
//   Cascade  → EmailVerificationToken, UserDocument, CreatorPost, UserFile, Notification,
//              PaymentMethod, Subscription (удаляются автоматически вместе с User);
//   SetNull  → Payment и RecurringConsent (платёжные операции хранятся не менее PAYMENT_RETENTION_YEARS
//              (6 лет, lib/payment-config.ts — бухгалтерский/налоговый учёт): остаются с userId → null, плательщик — в Payment.payerEmail);
//              PageVisit (остаётся, userId → null — сознательно, для аналитики);
//   Restrict → InviteCode, Transaction (+ каскад дочерних), Report, SavedListingContact,
//              BlacklistReport, AnuntGeneration — удаляем ЯВНО до delete(User),
//              иначе FK-constraint не даст удалить пользователя.
//
// CyberSource — ДО удаления (у пользователя без подписок/карт CyberSource шаги 1–4 пустые):
//   1) платёж в пути (PENDING/UNKNOWN моложе часа) → 409, ничего не меняем;
//   2) закрыть подписки (личные и агентские), затем повторить проверку 1 — списание могло
//      стартовать между проверкой и закрытием;
//   3) удалить токены карт у банка;
//   4) хоть один токен не удалился → аккаунт НЕ удаляем, 503 + алерт. После удаления
//      PaymentMethod ушёл бы каскадом и токен остался бы у банка без записи у нас. Закрытая
//      подписка + карта ACTIVE = незавершённое удаление; повторный вызов продолжит с шага 3;
//   5) удаление данных; участникам агентства владельца — личный план или null (releaseHubUsers),
//      иначе у них остался бы бессрочный HUB от удалённого агентства (касается и VictoriaBank).
export async function deleteUserCompletely(
  userId: string,
  opts: { now?: Date; tms?: TmsDeleter } = {},
): Promise<DeleteUserResult> {
  const now = opts.now ?? new Date();

  if (await hasPaymentInFlight(userId, now)) return { ok: false, status: 409, message: MSG_PAYMENT_IN_FLIGHT };
  await closeCyberSourceSubscriptions(userId, now);
  if (await hasPaymentInFlight(userId, now)) return { ok: false, status: 409, message: MSG_PAYMENT_IN_FLIGHT };

  const failedPms = await retireAllPaymentMethods(userId, now, opts.tms);
  if (failedPms.length) {
    console.error(JSON.stringify({ evt: "account_delete", userId, alert: "CS_ACCOUNT_DELETE_TOKEN_FAILED", paymentMethodIds: failedPms }));
    return { ok: false, status: 503, message: MSG_TOKEN_FAILED };
  }

  // Blob-URL документов пользователя — для очистки файлов после транзакции.
  const docs = await prisma.transactionDocument.findMany({
    where: { transaction: { userId } },
    select: { fileUrl: true },
  });
  // Хеши чёрного списка, на которые ссылаются объявления — обнулим ссылку перед удалением.
  const brs = await prisma.blacklistReport.findMany({
    where: { reporterId: userId },
    select: { phoneHash: true },
  });
  const hashes = brs.map((b) => b.phoneHash);

  await prisma.$transaction(async (db) => {
    // Платежи НЕ удаляются: после удаления аккаунта они остаются с userId = null. Снимок
    // e-mail плательщика проставлен при создании платежа; здесь — подстраховка для записей
    // без него, пока связь с аккаунтом ещё есть.
    const owner = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (owner) {
      await db.payment.updateMany({
        where: { userId, payerEmail: null },
        data: { payerEmail: owner.email },
      });
    }
    if (hashes.length) {
      await db.listing999.updateMany({
        where: { blacklistPhoneHash: { in: hashes } },
        data: { blacklistPhoneHash: null },
      });
    }
    await db.blacklistReport.deleteMany({ where: { reporterId: userId } });
    await db.savedListingContact.deleteMany({ where: { userId } });
    await db.anuntGeneration.deleteMany({ where: { userId } });
    await db.notification.deleteMany({ where: { userId } });
    // Report не каскадится с Transaction — удаляем явно (по userId покрывает все).
    await db.report.deleteMany({ where: { userId } });
    // Дочерние записи транзакций каскадятся (onDelete: Cascade в схеме).
    await db.transaction.deleteMany({ where: { userId } });
    await db.inviteCode.deleteMany({ where: { createdById: userId } });
    // Владелец агентства: агентство и членства уйдут каскадом — до этого снимаем HUB с
    // участников (личный план, если есть, иначе null; sessionVersion++).
    const agency = await db.agency.findUnique({ where: { ownerId: userId }, select: { id: true } });
    if (agency) {
      const members = await db.agencyMembership.findMany({
        where: { agencyId: agency.id, userId: { not: userId } },
        select: { userId: true },
      });
      await releaseHubUsers(members.map((m) => m.userId), db, now);
    }
    // Cascade-связи (EmailVerificationToken, UserDocument, CreatorPost, UserFile, Notification,
    // PaymentMethod, Subscription) уйдут автоматически; Payment, RecurringConsent и PageVisit
    // отвяжутся (SetNull).
    await db.user.delete({ where: { id: userId } });
  });

  // Очистка файлов в Blob — best-effort, вне транзакции.
  const blobUrls = docs.map((d) => d.fileUrl).filter((u) => /^https?:\/\//.test(u));
  if (blobUrls.length) await del(blobUrls).catch(() => {});
  return { ok: true };
}
