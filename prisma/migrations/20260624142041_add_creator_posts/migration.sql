-- CreateTable
CREATE TABLE "creator_posts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "slides" JSONB,
    "reels" JSONB,
    "post" TEXT,
    "hashtags" TEXT,
    "imageUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creator_posts_userId_idx" ON "creator_posts"("userId");

-- CreateIndex
CREATE INDEX "creator_posts_expiresAt_idx" ON "creator_posts"("expiresAt");

-- AddForeignKey
ALTER TABLE "creator_posts" ADD CONSTRAINT "creator_posts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
