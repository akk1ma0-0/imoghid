import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { isPayablePlan, planAmount, generateOrder, PLAN_PRICING } from "@/lib/payments";
import { buildPaymentFormHtml, formatAmount, vbConfig } from "@/lib/vb-egateway";
import { personalPlanPurchaseBlock } from "@/lib/agency";

// Отказ, понятный пользователю: форма тарифа отправляется нативным POST, поэтому браузер
// показал бы «голый» JSON. Браузеру (Accept: text/html) — короткая страница с сообщением и
// ссылкой назад; остальным клиентам — JSON { error }.
function blockedResponse(request: Request, message: string, status: number): NextResponse {
  if ((request.headers.get("accept") ?? "").includes("text/html")) {
    const html =
      `<!doctype html><html lang="ro"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1"><title>ImoGhid</title></head>` +
      `<body style="font-family:Inter,system-ui,-apple-system,sans-serif;color:#111827;margin:0;padding:24px">` +
      `<div style="max-width:480px;margin:48px auto;text-align:center">` +
      `<p style="font-size:15px;line-height:1.6;margin:0 0 20px">${message}</p>` +
      `<a href="/app/pending" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;` +
      `font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px">← Înapoi la abonament</a>` +
      `</div></body></html>`;
    return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return NextResponse.json({ error: message }, { status });
}

// POST /api/payments/vb-initiate — форма (plan). Создаёт Payment (TRTYPE=0) и возвращает
// авто-сабмит HTML-форму на страницу оплаты VictoriaBank (TEST). Тариф/сумма — только сервер.
export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  // Личный план (Basic/Pro) не покупают: участник агентства (MEMBER) — пока не вышел; владелец
  // активного агентства — иначе HUB заменился бы личным планом. До создания Payment и формы
  // банка. Обычные пользователи не затрагиваются; места/HUB/«O accesare» — другие роуты.
  const blockMsg = await personalPlanPurchaseBlock(sess.userId);
  if (blockMsg) {
    return blockedResponse(request, blockMsg, 409);
  }

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

  // Согласие с условиями оплаты/возврата — обязательно (SIP п.7). Не полагаемся на
  // frontend-disabled: проверяем и на сервере. Без agreedToTerms=true → 400.
  const agreedToTerms = form ? String(form.get("agreedToTerms") ?? "") === "true" : false;
  if (!agreedToTerms) {
    return NextResponse.json(
      { error: "Trebuie să acceptați Termenii și Condițiile de plată și Politica de returnare." },
      { status: 400 },
    );
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
        data: { order, userId: sess.userId, payerEmail: user.email, plan: planRaw, amount, currency: c.currency },
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
