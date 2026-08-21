-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'SINGLE_ACCESS';

-- AlterEnum
ALTER TYPE "UsageFeature" ADD VALUE 'OBIECTE_CREATE';

-- CreateTable
CREATE TABLE "single_access_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" "UsageFeature" NOT NULL,
    "paymentId" TEXT,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "single_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "single_access_grants_userId_idx" ON "single_access_grants"("userId");

-- AddForeignKey
ALTER TABLE "single_access_grants" ADD CONSTRAINT "single_access_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "single_access_grants" ADD CONSTRAINT "single_access_grants_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
