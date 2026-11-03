-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "amount" TEXT,
ADD COLUMN     "anchorAt" TIMESTAMP(3),
ADD COLUMN     "billingHold" TEXT,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "graceEndsAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentFor" TIMESTAMP(3);

