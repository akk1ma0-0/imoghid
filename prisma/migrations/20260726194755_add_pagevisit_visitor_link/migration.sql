-- AlterTable
ALTER TABLE "page_visits" ADD COLUMN     "userId" TEXT,
ADD COLUMN     "visitorId" TEXT;

-- CreateIndex
CREATE INDEX "page_visits_visitorId_idx" ON "page_visits"("visitorId");

-- AddForeignKey
ALTER TABLE "page_visits" ADD CONSTRAINT "page_visits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
