-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('SUBSCRIPTION', 'OVERAGE');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "overageConsumedAt" TIMESTAMP(3),
ADD COLUMN     "overageFeature" "UsageFeature",
ADD COLUMN     "purpose" "PaymentPurpose" NOT NULL DEFAULT 'SUBSCRIPTION';
