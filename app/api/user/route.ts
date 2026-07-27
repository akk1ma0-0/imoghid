import { NextResponse } from "next/server";

import { requireSession } from "@/lib/transaction-auth";
import { deleteUserCompletely } from "@/lib/delete-user";

// DELETE /api/user — удаляет текущего пользователя и ВСЕ его данные. Клиент после успеха
// делает signOut() + redirect на /login. FK-безопасный порядок — в lib/delete-user.ts.
export async function DELETE() {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  await deleteUserCompletely(sess.userId);
  return NextResponse.json({ ok: true });
}
