import { del } from "@vercel/blob";

import { prisma } from "@/lib/prisma";

// Полное удаление пользователя и всех его данных в FK-безопасном порядке.
// Используется и self-delete (/api/user), и admin-delete (/api/admin/users/[id]).
//
// onDelete по схеме для связей на User:
//   Cascade  → Payment, EmailVerificationToken, UserDocument, CreatorPost, UserFile,
//              Notification (удаляются автоматически вместе с User);
//   SetNull  → PageVisit (остаётся, userId → null — сознательно, для аналитики);
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
    // Cascade-связи (Payment, EmailVerificationToken, UserDocument, CreatorPost,
    // UserFile, Notification) уйдут автоматически; PageVisit отвяжется (SetNull).
    await db.user.delete({ where: { id: userId } });
  });

  // Очистка файлов в Blob — best-effort, вне транзакции.
  const blobUrls = docs.map((d) => d.fileUrl).filter((u) => /^https?:\/\//.test(u));
  if (blobUrls.length) await del(blobUrls).catch(() => {});
}
