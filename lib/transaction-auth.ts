import { NextResponse } from "next/server";
import type { Prisma, Transaction } from "@prisma/client";

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
