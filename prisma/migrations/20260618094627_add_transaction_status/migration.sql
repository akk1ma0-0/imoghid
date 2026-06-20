-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('ACTIVE', 'WAITING', 'DONE', 'ARCHIVE');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "status" "TransactionStatus" NOT NULL DEFAULT 'ACTIVE';
