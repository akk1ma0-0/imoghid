-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_userId_fkey";

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "payerEmail" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- Data: снимок e-mail плательщика для уже существующих платежей (п. 3.2.5 контракта банка —
-- операции хранятся 2 года, в т.ч. после удаления аккаунта).
UPDATE "payments" AS p
SET "payerEmail" = u."email"
FROM "users" AS u
WHERE p."userId" = u."id" AND p."payerEmail" IS NULL;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

