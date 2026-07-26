import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

// POST /api/track/visit — минимальный серверный счётчик визитов воронки (лендинг/регистрация).
// Без авторизации. Одна строка на визит; UTM — из тела (клиент читает их из URL, без гонки с cookie).
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const path = typeof body?.path === "string" ? body.path.slice(0, 64) : "unknown";
  const clip = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 200) : null);

  try {
    await prisma.pageVisit.create({
      data: {
        path,
        utmSource: clip(body?.utmSource),
        utmCampaign: clip(body?.utmCampaign),
        utmMedium: clip(body?.utmMedium),
      },
    });
  } catch (e) {
    console.error("track visit error:", e);
  }
  // Всегда 200 — трекинг не должен влиять на UX.
  return NextResponse.json({ ok: true });
}
