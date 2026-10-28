import { del } from "@vercel/blob";

import { prisma } from "@/lib/prisma";

// Полное удаление пользователя и всех его данных в FK-безопасном порядке.
// Используется и self-delete (/api/user), и admin-delete (/api/admin/users/[id]).
//
// onDelete по схеме для связей на User:
//   Cascade  → EmailVerificationToken, UserDocument, CreatorPost, UserFile, Notification,
//              PaymentMethod, Subscription (удаляются автоматически вместе с User);
//   SetNull  → Payment и RecurringConsent (платёжные операции хранятся 2 года — контракт банка,
//              п. 3.2.5: остаются с userId → null, плательщик — в Payment.payerEmail);
//              PageVisit (остаётся, userId → null — сознательно, для аналитики);
//   Restrict → InviteCode, Transaction (+ каскад дочерних), Report, SavedListingContact,
//              BlacklistReport, AnuntGeneration — удаляем ЯВНО до delete(User),
//              иначе FK-constraint не даст удалить пользователя.
export async function deleteUserCompletely(userId: string): Promise<void> {
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
    // Cascade-связи (EmailVerificationToken, UserDocument, CreatorPost, UserFile, Notification,
    // PaymentMethod, Subscription) уйдут автоматически; Payment, RecurringConsent и PageVisit
    // отвяжутся (SetNull).
    await db.user.delete({ where: { id: userId } });
  });

  // Очистка файлов в Blob — best-effort, вне транзакции.
  const blobUrls = docs.map((d) => d.fileUrl).filter((u) => /^https?:\/\//.test(u));
  if (blobUrls.length) await del(blobUrls).catch(() => {});
}
