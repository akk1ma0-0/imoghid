import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { isValidPlan } from "@/lib/plan";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/admin/users/[id] — сменить план и/или заблокировать/разблокировать. Только ADMIN.
// Тело: { plan?: "BASIC" | "PRO", isBlocked?: boolean }
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, planActivatedAt: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Utilizator negăsit." }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (body.plan !== undefined) {
    if (!isValidPlan(body.plan)) {
      return NextResponse.json({ error: "Plan invalid." }, { status: 400 });
    }
    data.plan = body.plan;
    // Если план ещё не активировался — активируем сейчас, чтобы смена плана была эффективной.
    if (!target.planActivatedAt) data.planActivatedAt = new Date();
  }

  if (body.isBlocked !== undefined) {
    if (typeof body.isBlocked !== "boolean") {
      return NextResponse.json({ error: "isBlocked invalid." }, { status: 400 });
    }
    // Админ не может заблокировать собственный аккаунт.
    if (body.isBlocked && id === guard.userId) {
      return NextResponse.json(
        { error: "Nu vă puteți bloca propriul cont." },
        { status: 400 },
      );
    }
    data.isBlocked = body.isBlocked;
    data.blockedAt = body.isBlocked ? new Date() : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nimic de actualizat." }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, plan: true, isBlocked: true, blockedAt: true },
  });

  return NextResponse.json({ user: updated });
}
