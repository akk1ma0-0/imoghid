-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('VICTORIABANK', 'CYBERSOURCE');

-- CreateEnum
CREATE TYPE "PaymentInitiator" AS ENUM ('CUSTOMER', 'MERCHANT');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'UNKNOWN';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "attemptNo" INTEGER,
ADD COLUMN     "csTransactionId" TEXT,
ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "initiator" "PaymentInitiator" NOT NULL DEFAULT 'CUSTOMER',
ADD COLUMN     "networkTransactionId" TEXT,
ADD COLUMN     "periodStart" TIMESTAMP(3),
ADD COLUMN     "processorCode" TEXT,
ADD COLUMN     "provider" "PaymentProvider" NOT NULL DEFAULT 'VICTORIABANK',
ADD COLUMN     "subscriptionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_csTransactionId_key" ON "payments"("csTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_subscriptionId_periodStart_attemptNo_key" ON "payments"("subscriptionId", "periodStart", "attemptNo");

