-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "replacesSubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "pendingAmount" TEXT,
ADD COLUMN     "pendingFrom" TIMESTAMP(3),
ADD COLUMN     "pendingPlan" "SubscriptionPlan",
ADD COLUMN     "pendingSetAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "payments_replacesSubscriptionId_idx" ON "payments"("replacesSubscriptionId");
