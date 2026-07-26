import { NextResponse } from "next/server";
import type { Prisma, Transaction, SubscriptionPlan, UserRole } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Возвращает userId или 401-ответ. Использовать в начале каждого защищённого роута.
export async function requireSession(): Promise<
  { userId: string } | { response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      response: NextResponse.json({ error: "Neautentificat." }, { status: 401 }),
    };
  }
  return { userId: session.user.id };
}

// Серверная проверка ДОСТУПА к платным функциям (Claude API и пр.). Defense in depth:
// НЕ полагается на middleware/гейт страниц (кэш роутера, edge, iOS-cookie и т.п. могут
// пропустить пользователя на страницу). Проверяет план/роль по БД при каждом запросе.
//   • нет сессии → 401
//   • заблокирован / не найден → 403
//   • ADMIN → доступ есть всегда
//   • plan == null (в т.ч. waitlist/demo) → 403 (платные функции требуют активного плана)
export async function requirePaidAccess(): Promise<
  { userId: string; plan: SubscriptionPlan | null; role: UserRole } | { response: NextResponse }
> {
  const sess = await requireSession();
  if ("response" in sess) return sess;

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { plan: true, role: true, isBlocked: true },
  });
  if (!user || user.isBlocked) {
    return { response: NextResponse.json({ error: "Acces interzis." }, { status: 403 }) };
  }
  if (user.role === "ADMIN") {
    return { userId: sess.userId, plan: user.plan, role: user.role };
  }
  if (!user.plan) {
    return {
      response: NextResponse.json(
        { error: "Această funcție necesită un abonament activ." },
        { status: 403 },
      ),
    };
  }
  return { userId: sess.userId, plan: user.plan, role: user.role };
}

// Загружает транзакцию ТОЛЬКО если она принадлежит userId (иначе null — не раскрываем существование).
// Сохраняет типы payload при переданном include.
export async function loadOwnedTransaction<
  T extends Prisma.TransactionInclude | undefined = undefined,
>(
  txId: string,
  userId: string,
  include?: T,
): Promise<
  | (T extends Prisma.TransactionInclude
      ? Prisma.TransactionGetPayload<{ include: T }>
      : Transaction)
  | null
> {
  return prisma.transaction.findFirst({
    where: { id: txId, userId },
    include: include as Prisma.TransactionInclude | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

export function notFound() {
  return NextResponse.json({ error: "Tranzacție negăsită." }, { status: 404 });
}
