import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { merchantKeyDiagnostics } from "@/lib/vb-egateway";

// GET /api/payments/keycheck — ВРЕМЕННЫЙ диагностический роут.
// Возвращает отпечаток публичного ключа, выведенного из MERCHANT_PRIVATE_KEY на рантайме,
// чтобы сверить с тем, что зарегистрировано в банке. Отпечаток публичного ключа не секретен.
// Авторизация — ТОЛЬКО через заголовок (не query, чтобы токен не попадал в логи/URL):
//   Authorization: Bearer <token>   ИЛИ   X-Debug-Token: <token>
// Токен — DEBUG_KEYCHECK_TOKEN. Нет токена в env или несовпадение → 404 (не раскрываем роут).
function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function GET(request: Request) {
  const expected = process.env.DEBUG_KEYCHECK_TOKEN;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const custom = request.headers.get("x-debug-token") || "";
  const provided = bearer || custom;

  if (!expected || !provided || !timingSafeEqual(provided, expected)) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.json(merchantKeyDiagnostics());
}
