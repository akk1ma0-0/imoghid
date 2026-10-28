-- CreateTable
CREATE TABLE "recurring_consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "subscriptionId" TEXT,
    "paymentId" TEXT,
    "textVersion" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "recurring_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_consents_userId_idx" ON "recurring_consents"("userId");

-- CreateIndex
CREATE INDEX "recurring_consents_subscriptionId_idx" ON "recurring_consents"("subscriptionId");

-- AddForeignKey
ALTER TABLE "recurring_consents" ADD CONSTRAINT "recurring_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_consents" ADD CONSTRAINT "recurring_consents_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_consents" ADD CONSTRAINT "recurring_consents_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

