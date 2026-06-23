import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import {
  generateSocial,
  type Language,
  type Platform,
  type Topic,
} from "@/lib/social-creator";

const PLATFORMS: Platform[] = ["instagram", "tiktok", "facebook"];
const TOPICS: Topic[] = ["price", "check", "law40", "object"];

// POST /api/tools/creator — генерация контента для соцсетей (Claude).
// В Claude уходит только кешированный системный промпт + параметры запроса.
export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const platform = PLATFORMS.includes(body.platform as Platform)
    ? (body.platform as Platform)
    : "instagram";
  const language: Language = body.language === "ru" ? "ru" : "ro";
  const topic = TOPICS.includes(body.topic as Topic) ? (body.topic as Topic) : null;
  if (!topic) {
    return NextResponse.json({ error: "Alegeți o temă." }, { status: 400 });
  }

  let objectData: { description: string; price: string; notes: string } | undefined;
  if (topic === "object") {
    const od = (body.objectData ?? {}) as Record<string, unknown>;
    objectData = {
      description: typeof od.description === "string" ? od.description.trim() : "",
      price: typeof od.price === "string" ? od.price.trim() : "",
      notes: typeof od.notes === "string" ? od.notes.trim() : "",
    };
    if (!objectData.description) {
      return NextResponse.json(
        { error: "Completați descrierea obiectului." },
        { status: 400 },
      );
    }
  }

  const result = await generateSocial({ platform, language, topic, objectData });
  return NextResponse.json({ result });
}
