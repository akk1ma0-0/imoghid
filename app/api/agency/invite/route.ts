import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";

// POST /api/agency/invite — владелец агентства генерирует одноразовый код-приглашение
// (привязан к его Agency). Погашение (создание места + материализация HUB) — в /api/subscribe,
// там же проверяется наличие свободного места. Возвращает код.
function genCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без похожих символов
  let s = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) s += alphabet[bytes[i] % alphabet.length];
  return `AG-${s}`;
}

export async function POST() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  const agency = await prisma.agency.findUnique({
    where: { ownerId: sess.userId },
    select: { id: true },
  });
  if (!agency) {
    return NextResponse.json(
      { error: "Nu dețineți o agenție. Cumpărați locuri mai întâi." },
      { status: 400 },
    );
  }

  // Уникальный код (одна повторная попытка на коллизию).
  let code = genCode();
  for (let i = 0; i < 2; i++) {
    try {
      await prisma.inviteCode.create({
        data: { code, plan: "HUB", createdById: sess.userId, agencyId: agency.id, maxUses: 1 },
      });
      break;
    } catch {
      if (i === 1) {
        return NextResponse.json({ error: "Eroare la generarea codului." }, { status: 500 });
      }
      code = genCode();
    }
  }

  return NextResponse.json({ code });
}
