-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('LOGIN', 'LOGIN_FAILED', 'ADMIN_ACTION', 'EXPORT');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'AUDITOR';

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "type" "AuditEventType" NOT NULL,
    "userId" TEXT,
    "actorId" TEXT,
    "action" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" "UsageFeature" NOT NULL,
    "kind" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_type_createdAt_idx" ON "audit_events"("type", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_userId_createdAt_idx" ON "audit_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_createdAt_idx" ON "audit_events"("createdAt");

-- CreateIndex
CREATE INDEX "usage_events_createdAt_idx" ON "usage_events"("createdAt");

-- CreateIndex
CREATE INDEX "usage_events_userId_createdAt_idx" ON "usage_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "usage_events_feature_createdAt_idx" ON "usage_events"("feature", "createdAt");
