import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { vbRefund, vbCompletion, formatAmount, vbConfig } from "@/lib/vb-egateway";

// POST /api/admin/vb-test-refund — ВРЕМЕННЫЙ admin-only инструмент для сертификации с банком.
// Ручной вызов TRTYPE=21 (finalizare) или TRTYPE=24 (reversare/refund) по существующему заказу,
// чтобы прогнать тест-сценарии на TEST-окружении и получить RRN. Постоянного пользовательского
// UI для возвратов пока нет (политика возврата не согласована с юристом — отдельно).
//
// Тело: {
//   order:    string,                 // ORDER исходного платежа (обязательно)
//   action?:  "refund" | "complete",  // 24 (default) или 21
//   amount?:  string|number,          // для частичного возврата; default — сумма платежа
//   rrn?:     string,                 // override, если в БД нет (callback не долетел до localhost)
//   intRef?:  string,
//   currency?: string,
// }
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  const c = vbConfig();
  if (!c.terminal || !c.merchant || !(process.env.MERCHANT_PRIVATE_KEY_PATH || process.env.MERCHANT_PRIVATE_KEY)) {
    return NextResponse.json({ error: "VictoriaBank nu este configurat." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const order = typeof body?.order === "string" ? body.order.trim() : "";
  const action = body?.action === "complete" ? "complete" : "refund";
  if (!order) return NextResponse.json({ error: "order este obligatoriu." }, { status: 400 });

  const payment = await prisma.payment.findUnique({ where: { order } });
  if (!payment && !(body?.rrn && body?.intRef)) {
    return NextResponse.json(
      { error: "Payment negăsit pentru acest order (sau furnizați rrn+intRef manual)." },
      { status: 404 },
    );
  }

  const rrn = typeof body?.rrn === "string" ? body.rrn : (payment?.rrn ?? "");
  const intRef = typeof body?.intRef === "string" ? body.intRef : (payment?.intRef ?? "");
  const currency = typeof body?.currency === "string" ? body.currency : (payment?.currency ?? c.currency);
  const amount =
    body?.amount !== undefined ? formatAmount(Number(body.amount)) : (payment?.amount ?? "");

  if (!rrn || !intRef) {
    return NextResponse.json(
      { error: "Lipsesc RRN/INT_REF (din callback-ul TRTYPE=0). Furnizați-le în body." },
      { status: 400 },
    );
  }
  if (!amount) return NextResponse.json({ error: "Lipsește AMOUNT." }, { status: 400 });

  try {
    const result =
      action === "complete"
        ? await vbCompletion({ order, amount, currency, rrn, intRef })
        : await vbRefund({ order, amount, currency, rrn, intRef });

    console.log(`[vb-test ${action}] order=${order} amount=${amount} → RC=${result.RC ?? "?"} RRN=${result.RRN ?? "-"}`);
    return NextResponse.json({
      action: action === "complete" ? "TRTYPE=21" : "TRTYPE=24",
      sent: { order, amount, currency, rrn, intRef },
      response: result, // включает RC, RRN и пр. от банка
    });
  } catch (e) {
    console.error(`[vb-test ${action}] error order=${order}`, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Eroare la apelul băncii." },
      { status: 502 },
    );
  }
}
