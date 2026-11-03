-- CreateEnum
CREATE TYPE "PaymentOperationType" AS ENUM ('VOID', 'REFUND', 'REVERSAL', 'CAPTURE', 'TOKEN_DELETE', 'RECONCILE');

-- CreateTable
CREATE TABLE "payment_operations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'CYBERSOURCE',
    "type" "PaymentOperationType" NOT NULL,
    "requestId" TEXT,
    "httpStatus" INTEGER,
    "outcome" TEXT NOT NULL,
    "amount" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_operations_paymentId_idx" ON "payment_operations"("paymentId");

-- AddForeignKey
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

