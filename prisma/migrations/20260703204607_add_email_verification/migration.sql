-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerified" TIMESTAMP(3);

-- Grandfathering: все существующие пользователи (созданные до этой миграции) считаются
-- подтверждёнными задним числом, чтобы НЕ потерять доступ. UPDATE выполняется один раз при
-- накатывании миграции; на этот момент now() = время миграции, поэтому condition createdAt < now()
-- истинно для ВСЕХ уже существующих строк. Новые пользователи регистрируются ПОСЛЕ этого шага →
-- у них emailVerified остаётся NULL (по умолчанию) → они проходят подтверждение e-mail.
UPDATE "users" SET "emailVerified" = now() WHERE "createdAt" < now() AND "emailVerified" IS NULL;

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_key" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
