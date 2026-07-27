import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { isValidPlan } from "@/lib/plan";
import { deleteUserCompletely } from "@/lib/delete-user";

type Params = { params: Promise<{ id: string }> };

// Простая защита от перебора пароля подтверждения (best-effort, per-instance):
// после N неудач в окне — блокируем на время. На serverless счётчик живёт в рамках
// инстанса, но вместе с bcrypt-задержкой это достаточный барьер против скриптового перебора.
const DELETE_ATTEMPTS = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 минут

// PATCH /api/admin/users/[id] — сменить план и/или заблокировать/разблокировать. Только ADMIN.
// Тело: { plan?: "BASIC" | "PRO" | null (снять план → în așteptare), isBlocked?: boolean }
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
    if (body.plan === null) {
      // Снятие плана — возврат в «în așteptare» (plan=null). Чистый сброс активации/срока.
      // sessionVersion++ → мгновенный разлогин (не ждём, пока пользователь сам перезайдёт).
      data.plan = null;
      data.planActivatedAt = null;
      data.planExpiresAt = null;
      data.sessionVersion = { increment: 1 };
    } else if (isValidPlan(body.plan)) {
      data.plan = body.plan;
      // Если план ещё не активировался — активируем сейчас, чтобы смена плана была эффективной.
      if (!target.planActivatedAt) data.planActivatedAt = new Date();
      // Ручное назначение админом — БЕЗ срока (не истекает; cron не трогает). Чистим старый срок.
      data.planExpiresAt = null;
    } else {
      return NextResponse.json({ error: "Plan invalid." }, { status: 400 });
    }
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

// DELETE /api/admin/users/[id] — необратимое удаление пользователя и всех его данных.
// Только ADMIN. Требует ввод отдельного пароля подтверждения (bcrypt-хэш в
// ADMIN_DELETE_CONFIRM_HASH). Нельзя удалить ADMIN-аккаунт и самого себя.
// Тело: { confirmPassword: string }.
export async function DELETE(request: Request, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  const { id } = await params;

  // ── Rate-limit перебора (по админу) ──
  const now = Date.now();
  const rec = DELETE_ATTEMPTS.get(guard.userId);
  if (rec && now < rec.resetAt && rec.count >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Prea multe încercări. Încercați mai târziu." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

  const hash = process.env.ADMIN_DELETE_CONFIRM_HASH;
  const ok = hash ? await bcrypt.compare(confirmPassword, hash) : false;
  if (!ok) {
    // Регистрируем неудачу + небольшая задержка (замедляем скриптовый перебор).
    const cur = rec && now < rec.resetAt ? rec : { count: 0, resetAt: now + ATTEMPT_WINDOW_MS };
    cur.count += 1;
    DELETE_ATTEMPTS.set(guard.userId, cur);
    await new Promise((r) => setTimeout(r, 1000));
    // Без подробностей — не подсказываем, что именно неверно.
    return NextResponse.json({ error: "Acces refuzat." }, { status: 403 });
  }
  // Успех — сбрасываем счётчик попыток.
  DELETE_ATTEMPTS.delete(guard.userId);

  // ── Защиты цели удаления ──
  if (id === guard.userId) {
    return NextResponse.json(
      { error: "Nu vă puteți șterge propriul cont." },
      { status: 403 },
    );
  }
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) {
    return NextResponse.json({ error: "Utilizator negăsit." }, { status: 404 });
  }
  if (target.role === "ADMIN") {
    return NextResponse.json(
      { error: "Conturile de administrator nu pot fi șterse din această interfață." },
      { status: 403 },
    );
  }

  await deleteUserCompletely(id);
  return NextResponse.json({ ok: true });
}
