-- CreateTable
CREATE TABLE "cadastru_checks" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cadastralNo" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "source" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "ms" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cadastru_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cadastru_checks_requestId_key" ON "cadastru_checks"("requestId");

-- CreateIndex
CREATE INDEX "cadastru_checks_userId_createdAt_idx" ON "cadastru_checks"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "cadastru_checks_createdAt_idx" ON "cadastru_checks"("createdAt");
