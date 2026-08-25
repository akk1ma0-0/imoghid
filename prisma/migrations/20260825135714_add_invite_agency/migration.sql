-- AlterTable
ALTER TABLE "invite_codes" ADD COLUMN     "agencyId" TEXT;

-- CreateIndex
CREATE INDEX "invite_codes_agencyId_idx" ON "invite_codes"("agencyId");

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
