import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { isPayablePlan, planAmount, generateOrder, PLAN_PRICING } from "@/lib/payments";
import { buildPaymentFormHtml, formatAmount, vbConfig } from "@/lib/vb-egateway";

// POST /api/admin/vb-test-initiate — ВРЕМЕННЫЙ admin-only запуск ТЕСТОВОГО платежа
// (сертификация VictoriaBank). Full-page форма: { plan, skip? }.
//   skip=1 → Payment.skipAutoCompletion=true → callback НЕ вызовет авто-TRTYPE=21
//            (для Testul 2 = чистый 0→24). Плательщик — сам админ.
// Возвращает авто-сабмит форму на TEST-страницу банка (браузер редиректит на оплату).
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  const c = vbConfig();
  const hasKey = process.env.MERCHANT_PRIVATE_KEY_PATH || process.env.MERCHANT_PRIVATE_KEY;
  if (!c.terminal || !c.merchant || !hasKey) {
    return NextResponse.json({ error: "VictoriaBank nu este configurat." }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const planRaw = form ? String(form.get("plan") ?? "") : "";
  const skip = form ? String(form.get("skip") ?? "") === "1" : false;
  if (!isPayablePlan(planRaw)) {
    return NextResponse.json({ error: "Plan invalid." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: guard.userId },
    select: { email: true },
  });
  if (!user) return NextResponse.json({ error: "Utilizator negăsit." }, { status: 404 });

  const amount = formatAmount(planAmount(planRaw));

  let order = generateOrder();
  for (let i = 0; i < 2; i++) {
    try {
      await prisma.payment.create({
        data: {
          order,
          userId: guard.userId,
          plan: planRaw,
          amount,
          currency: c.currency,
          skipAutoCompletion: skip,
        },
      });
      break;
    } catch {
      if (i === 1) {
        return NextResponse.json({ error: "Eroare la inițiere." }, { status: 500 });
      }
      order = generateOrder();
    }
  }

  const origin = new URL(request.url).origin;
  const html = buildPaymentFormHtml({
    order,
    amount,
    desc: `TEST ImoGhid ${PLAN_PRICING[planRaw].label}${skip ? " (skip 21)" : ""}`,
    email: user.email,
    backref: `${origin}/payment-result`,
  });

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
