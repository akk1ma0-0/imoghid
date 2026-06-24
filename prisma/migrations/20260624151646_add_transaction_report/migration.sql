-- CreateTable
CREATE TABLE "transaction_reports" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "docxUrl" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transaction_reports_transactionId_key" ON "transaction_reports"("transactionId");

-- AddForeignKey
ALTER TABLE "transaction_reports" ADD CONSTRAINT "transaction_reports_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
