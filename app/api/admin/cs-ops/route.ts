import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { csConfig, CsConfigError } from "@/lib/cybersource/client";
import { refundPayment, voidTransaction } from "@/lib/cybersource/payments";
import { deleteCustomer } from "@/lib/cybersource/tms";
import { completeCitPayment } from "@/lib/cybersource/cit";
import type { CsOutcome } from "@/lib/cybersource/responses";

// POST /api/admin/cs-ops { action, paymentId, amount? } — операции для приёмки банка.
// Только ADMIN и только тестовая среда CyberSource (CS_ENV=test). Каждая операция пишется в
// PaymentOperation с Request ID CyberSource. В ответе — только коды, id и исход.
//   void         — отмена списания (тот же день, до settlement);
//   refund       — возврат (amount — по умолчанию полная сумма платежа);
//   delete_token — удаление TMS customer (с картой) по подписке платежа; подписка → CANCELED;
//   reconcile    — сверка/завершение CIT-платежа (UNKNOWN/PENDING) тем же кодом, что /complete.
export const dynamic = "force-dynamic";

const outcomeOf = (o: CsOutcome) => ({
  outcome: o.kind,
  requestId: "requestId" in o ? o.requestId : null,
  httpStatus: "httpStatus" in o ? o.httpStatus : o.kind === "not_found" ? 404 : 201,
  status: "status" in o ? o.status : null,
});

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    if (csConfig().env !== "test") {
      return NextResponse.json({ error: "Disponibil doar în mediul de test CyberSource." }, { status: 403 });
    }
  } catch (e) {
    if (e instanceof CsConfigError) return NextResponse.json({ error: "CyberSource nu este configurat." }, { status: 503 });
    throw e;
  }

  const body = (await request.json().catch(() => null)) as { action?: unknown; paymentId?: unknown; amount?: unknown } | null;
  const action = body?.action;
  const paymentId = typeof body?.paymentId === "string" ? body.paymentId : "";
  const payment = paymentId
    ? await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { subscription: { include: { paymentMethod: true } } },
      })
    : null;
  if (!payment || payment.provider !== "CYBERSOURCE") {
    return NextResponse.json({ error: "Plata CyberSource nu a fost găsită." }, { status: 404 });
  }

  const record = (type: "VOID" | "REFUND" | "TOKEN_DELETE" | "RECONCILE", r: { outcome: string; requestId: string | null; httpStatus: number | null }, amount?: string) =>
    prisma.paymentOperation.create({
      data: { paymentId: payment.id, type, outcome: r.outcome, requestId: r.requestId, httpStatus: r.httpStatus, amount: amount ?? null, actorUserId: guard.userId },
    });

  if (action === "void" || action === "refund") {
    if (!payment.csTransactionId) return NextResponse.json({ error: "Plata nu are ID de tranzacție." }, { status: 409 });
    if (action === "void") {
      const r = outcomeOf(await voidTransaction(payment.csTransactionId, `${payment.order}-V`));
      await record("VOID", r);
      return NextResponse.json({ action, ...r });
    }
    const amount = body?.amount === undefined ? Number(payment.amount) : Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > Number(payment.amount)) {
      return NextResponse.json({ error: "Sumă invalidă." }, { status: 400 });
    }
    const r = outcomeOf(await refundPayment(payment.csTransactionId, amount, `${payment.order}-R`));
    await record("REFUND", r, amount.toFixed(2));
    return NextResponse.json({ action, amount: amount.toFixed(2), ...r });
  }

  if (action === "delete_token") {
    const pm = payment.subscription?.paymentMethod;
    if (!pm || pm.status === "REMOVED") return NextResponse.json({ error: "Token activ negăsit." }, { status: 409 });
    const res = await deleteCustomer(pm.tmsCustomerId);
    const r = { outcome: res.ok ? (res.alreadyGone ? "already_gone" : "deleted") : "error", requestId: null, httpStatus: res.ok ? 204 : res.httpStatus };
    await record("TOKEN_DELETE", r);
    if (res.ok) {
      await prisma.$transaction([
        prisma.paymentMethod.update({ where: { id: pm.id }, data: { status: "REMOVED", removedAt: new Date() } }),
        prisma.subscription.update({
          where: { id: payment.subscription!.id },
          data: { status: "CANCELED", cancelAtPeriodEnd: true, canceledAt: new Date(), nextChargeAt: null, pendingPlan: null, pendingAmount: null, pendingFrom: null, pendingSetAt: null },
        }),
      ]);
    }
    return NextResponse.json({ action, ...r });
  }

  if (action === "reconcile") {
    const res = await completeCitPayment({ paymentId: payment.id, actorUserId: guard.userId, asAdmin: true });
    await record("RECONCILE", { outcome: res.status, requestId: null, httpStatus: null });
    const fresh = await prisma.payment.findUnique({ where: { id: payment.id }, select: { status: true, csTransactionId: true } });
    return NextResponse.json({ action, result: res.status, paymentStatus: fresh?.status, csTransactionId: fresh?.csTransactionId ?? null });
  }

  return NextResponse.json({ error: "Acțiune invalidă." }, { status: 400 });
}
