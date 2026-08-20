-- CreateEnum
CREATE TYPE "UsageFeature" AS ENUM ('CADASTRU_CHECK', 'DOSAR_ANALYSIS', 'CREATOR_HUB', 'ANUNT_999');

-- CreateTable
CREATE TABLE "usage_counters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" "UsageFeature" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_counters_userId_idx" ON "usage_counters"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_userId_feature_key" ON "usage_counters"("userId", "feature");

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
