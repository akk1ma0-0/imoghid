import { NextResponse } from "next/server";

import { requirePaidAccess } from "@/lib/transaction-auth";
import { isDemoRequest } from "@/lib/demo-guard";
import { consumeUsage, usageBlockResponse } from "@/lib/usage";
import {
  generateSocial,
  type Language,
  type Platform,
} from "@/lib/social-creator";
import { generateAnunt } from "@/lib/tools-claude";

const SOCIAL_PLATFORMS: Platform[] = ["instagram", "tiktok", "facebook"];

// POST /api/tools/creator
// platform "999" → анонс для 999.md (RO + RU) через generateAnunt (lib/tools-claude.ts).
// иначе → контент для соцсетей (slides/reels/post).
export async function POST(request: Request) {
  // Платный роут (Claude API): требует активный план/админа независимо от гейта страниц.
  const sess = await requirePaidAccess();
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
    // Лимит тарифа ANUNT_999 (Basic — недоступно / Pro 60 в мес). Demo не считается.
    if (!(await isDemoRequest())) {
      const usage = await consumeUsage(sess.userId, "ANUNT_999");
      if (!usage.ok) return usageBlockResponse(usage, "ANUNT_999");
    }
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

  // Лимит тарифа CREATOR_HUB (Basic 20 / Pro 60 в мес). Demo не считается.
  if (!(await isDemoRequest())) {
    const usage = await consumeUsage(sess.userId, "CREATOR_HUB");
    if (!usage.ok) return usageBlockResponse(usage, "CREATOR_HUB");
  }

  const social = await generateSocial({
    platform: socialPlatform,
    language,
    topic,
  });
  return NextResponse.json({ result: { kind: "social", ...social } });
}
