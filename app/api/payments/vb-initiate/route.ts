import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { isPayablePlan, planAmount, generateOrder, PLAN_PRICING } from "@/lib/payments";
import { buildPaymentFormHtml, formatAmount, vbConfig } from "@/lib/vb-egateway";

// POST /api/payments/vb-initiate — форма (plan). Создаёт Payment (TRTYPE=0) и возвращает
// авто-сабмит HTML-форму на страницу оплаты VictoriaBank (TEST). Тариф/сумма — только сервер.
export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  // Конфиг обязателен — без терминала/ключа платёж не инициировать.
  const c = vbConfig();
  const hasKey = process.env.MERCHANT_PRIVATE_KEY_PATH || process.env.MERCHANT_PRIVATE_KEY;
  if (!c.terminal || !c.merchant || !hasKey) {
    return NextResponse.json(
      { error: "Plățile nu sunt configurate (lipsesc credențialele VictoriaBank)." },
      { status: 503 },
    );
  }

  const form = await request.formData().catch(() => null);
  const planRaw = form ? String(form.get("plan") ?? "") : "";
  if (!isPayablePlan(planRaw)) {
    return NextResponse.json({ error: "Plan invalid." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { email: true },
  });
  if (!user) return NextResponse.json({ error: "Utilizator negăsit." }, { status: 404 });

  const amount = formatAmount(planAmount(planRaw)); // сервер решает сумму, не клиент

  // Уникальный ORDER (одна повторная попытка на случай коллизии).
  let order = generateOrder();
  for (let i = 0; i < 2; i++) {
    try {
      await prisma.payment.create({
        data: { order, userId: sess.userId, plan: planRaw, amount, currency: c.currency },
      });
      break;
    } catch {
      if (i === 1) {
        return NextResponse.json({ error: "Eroare la inițierea plății." }, { status: 500 });
      }
      order = generateOrder();
    }
  }

  const origin = new URL(request.url).origin;
  const html = buildPaymentFormHtml({
    order,
    amount,
    desc: `Abonament ImoGhid ${PLAN_PRICING[planRaw].label}`,
    email: user.email,
    backref: `${origin}/payment-result`,
  });

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
