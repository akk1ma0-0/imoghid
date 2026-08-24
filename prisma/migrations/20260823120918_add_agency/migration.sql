-- CreateEnum
CREATE TYPE "AgencyRole" AS ENUM ('OWNER', 'MEMBER');

-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'AGENCY_SEATS';

-- AlterEnum
ALTER TYPE "SubscriptionPlan" ADD VALUE 'HUB';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "seats" INTEGER;

-- CreateTable
CREATE TABLE "agencies" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "seatsPaid" INTEGER NOT NULL DEFAULT 0,
    "pricePerSeatMdl" INTEGER NOT NULL DEFAULT 450,
    "planExpiresAt" TIMESTAMP(3),
    "negotiated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_memberships" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AgencyRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agencies_ownerId_key" ON "agencies"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "agency_memberships_userId_key" ON "agency_memberships"("userId");

-- CreateIndex
CREATE INDEX "agency_memberships_agencyId_idx" ON "agency_memberships"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "agency_memberships_agencyId_userId_key" ON "agency_memberships"("agencyId", "userId");

-- AddForeignKey
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_memberships" ADD CONSTRAINT "agency_memberships_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_memberships" ADD CONSTRAINT "agency_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
