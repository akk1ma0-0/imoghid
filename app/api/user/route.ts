import { NextResponse } from "next/server";
import { del } from "@vercel/blob";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";

// DELETE /api/user — удаляет пользователя и ВСЕ его данные. Клиент после успеха
// делает signOut() + redirect на /login.
export async function DELETE() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;
  const userId = sess.userId;

  // Соберём blob-URL документов пользователя для последующей очистки.
  const docs = await prisma.transactionDocument.findMany({
    where: { transaction: { userId } },
    select: { fileUrl: true },
  });
  // Хеши из чёрного списка, на которые ссылаются объявления — обнулим ссылку перед удалением.
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
    await db.user.delete({ where: { id: userId } });
  });

  // Очистка файлов в Blob — best-effort, вне транзакции.
  const blobUrls = docs.map((d) => d.fileUrl).filter((u) => /^https?:\/\//.test(u));
  if (blobUrls.length) await del(blobUrls).catch(() => {});

  return NextResponse.json({ ok: true });
}
