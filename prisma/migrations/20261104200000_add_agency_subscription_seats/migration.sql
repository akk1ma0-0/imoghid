-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'AGENCY_TOPUP';

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "seats" INTEGER,
ADD COLUMN "pendingSeats" INTEGER;
