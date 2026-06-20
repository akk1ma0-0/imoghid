import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redeemInvite, InviteError } from "@/lib/invite";
import { isValidPlan } from "@/lib/plan";

// POST /api/subscribe — активирует план для текущего пользователя.
// Тело: { plan: "BASIC" | "PRO" }  ИЛИ  { inviteCode: string } (активирует PRO бесплатно).
//
// Примечание: реальная оплата через Stripe — отдельная задача. Здесь план
// активируется напрямую (план выдаётся вручную, см. комментарии в schema.prisma).
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
  }
  const userId = session.user.id;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp invalid." }, { status: 400 });
  }

  const inviteCode =
    typeof body.inviteCode === "string" && body.inviteCode.trim()
      ? body.inviteCode.trim()
      : null;
  const plan = body.plan;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (inviteCode) {
        const invitePlan = await redeemInvite(tx, inviteCode);
        return tx.user.update({
          where: { id: userId },
          data: {
            plan: invitePlan,
            planActivatedAt: new Date(),
            planExpiresAt: null,
          },
          select: { plan: true },
        });
      }

      if (isValidPlan(plan)) {
        return tx.user.update({
          where: { id: userId },
          data: {
            plan,
            planActivatedAt: new Date(),
            planExpiresAt: null,
          },
          select: { plan: true },
        });
      }

      throw new InviteError("Selectați un plan valid sau introduceți un cod.");
    });

    return NextResponse.json({ plan: updated.plan, planActive: true });
  } catch (error) {
    if (error instanceof InviteError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("subscribe error:", error);
    return NextResponse.json(
      { error: "Nu s-a putut activa abonamentul." },
      { status: 500 },
    );
  }
}
