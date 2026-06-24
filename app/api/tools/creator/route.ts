import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import {
  generateSocial,
  type Language,
  type Platform,
} from "@/lib/social-creator";
import { generateAnunt } from "@/lib/tools-claude";

const SOCIAL_PLATFORMS: Platform[] = ["instagram", "tiktok", "facebook"];

// POST /api/tools/creator
// platform "999" → анонс для 999.md (RO + RU, тот же генератор, что /generate-anunt).
// иначе → контент для соцсетей (slides/reels/post).
export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const platform = body.platform;

  // ── 999.md — анонс на двух языках ──
  if (platform === "999") {
    const od = (body.objectData ?? {}) as Record<string, unknown>;
    const description = typeof od.description === "string" ? od.description.trim() : "";
    const price = typeof od.price === "string" ? od.price.trim() : "";
    const notes = typeof od.notes === "string" ? od.notes.trim() : "";
    if (!description) {
      return NextResponse.json(
        { error: "Completați descrierea obiectului." },
        { status: 400 },
      );
    }
    const input = [description, price ? `Preț: ${price}` : "", notes]
      .filter(Boolean)
      .join(". ");
    const [ro, ru] = await Promise.all([
      generateAnunt(input, "ro"),
      generateAnunt(input, "ru"),
    ]);
    return NextResponse.json({ result: { kind: "anunt", ro, ru } });
  }

  // ── Соцсети ──
  const socialPlatform = SOCIAL_PLATFORMS.includes(platform as Platform)
    ? (platform as Platform)
    : "instagram";
  const language: Language = body.language === "ru" ? "ru" : "ro";
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  if (!topic) {
    return NextResponse.json({ error: "Alegeți o temă." }, { status: 400 });
  }

  const social = await generateSocial({
    platform: socialPlatform,
    language,
    topic,
  });
  return NextResponse.json({ result: { kind: "social", ...social } });
}
