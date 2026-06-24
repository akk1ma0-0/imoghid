import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";

const TTL_DAYS = 14;

// Удаляет просроченные генерации пользователя (cleanup при GET).
async function purgeExpired(userId: string) {
  await prisma.creatorPost.deleteMany({
    where: { userId, expiresAt: { lt: new Date() } },
  });
}

// GET /api/creator/posts — генерации пользователя (expiresAt > now), новые сверху.
export async function GET() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  await purgeExpired(sess.userId);
  const posts = await prisma.creatorPost.findMany({
    where: { userId: sess.userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ posts });
}

// POST /api/creator/posts — сохраняет текущую генерацию в галерею (TTL 14 дней).
export async function POST(req: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const platform = str(body.platform);
  if (!platform) {
    return NextResponse.json({ error: "Platformă lipsă." }, { status: 400 });
  }

  const imageUrls = Array.isArray(body.imageUrls)
    ? (body.imageUrls.filter((u) => typeof u === "string") as string[])
    : [];

  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

  // Json? поля задаём только при наличии значения (иначе остаются NULL — без Prisma.JsonNull).
  const data: Prisma.CreatorPostUncheckedCreateInput = {
    userId: sess.userId,
    platform,
    topic: str(body.topic) ?? "—",
    language: str(body.language) ?? "ro",
    post: str(body.post),
    hashtags: str(body.hashtags),
    imageUrls,
    expiresAt,
  };
  if (body.slides != null) data.slides = body.slides as Prisma.InputJsonValue;
  if (body.reels != null) data.reels = body.reels as Prisma.InputJsonValue;

  const post = await prisma.creatorPost.create({ data, select: { id: true, expiresAt: true } });
  return NextResponse.json({ id: post.id, expiresAt: post.expiresAt });
}
