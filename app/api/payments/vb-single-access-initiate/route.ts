import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { generateOrder } from "@/lib/payments";
import { SINGLE_ACCESS_FEE_MDL } from "@/lib/plan-limits";
import { buildPaymentFormHtml, formatAmount, vbConfig } from "@/lib/vb-egateway";

// POST /api/payments/vb-single-access-initiate — покупка «O accesare» (30 MDL): пакет из
// 3 одноразовых прав (1 verificare cadastrală + 1 examinare dosar + 1 obiect). Без плана.
// Создаёт Payment(purpose=SINGLE_ACCESS) и возвращает авто-сабмит форму VictoriaBank (TRTYPE=0).
// Гранты выдаёт callback при PAID (см. vb-callback). Сумма — только сервер.
export async function POST(request: Request) {
  const sess = await requireSession();
  if ("response" in sess) return sess.response;

  const c = vbConfig();
  const hasKey = process.env.MERCHANT_PRIVATE_KEY_PATH || process.env.MERCHANT_PRIVATE_KEY;
  if (!c.terminal || !c.merchant || !hasKey) {
    return NextResponse.json(
      { error: "Plățile nu sunt configurate (lipsesc credențialele VictoriaBank)." },
      { status: 503 },
    );
  }

  const form = await request.formData().catch(() => null);
  // Согласие с условиями оплаты/возврата — обязательно (SIP), как и у остальных платежей.
  const agreedToTerms = form ? String(form.get("agreedToTerms") ?? "") === "true" : false;
  if (!agreedToTerms) {
    return NextResponse.json(
      { error: "Trebuie să acceptați Termenii și Condițiile de plată și Politica de returnare." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { email: true, plan: true },
  });
  if (!user) return NextResponse.json({ error: "Utilizator negăsit." }, { status: 404 });

  const amount = formatAmount(SINGLE_ACCESS_FEE_MDL);

  // Уникальный ORDER (одна повторная попытка на коллизию). purpose=SINGLE_ACCESS → callback
  // НЕ активирует план, а создаёт 3 грант-строки. plan хранит текущий план (может быть null).
  let order = generateOrder();
  for (let i = 0; i < 2; i++) {
    try {
      await prisma.payment.create({
        data: {
          order,
          userId: sess.userId,
          plan: user.plan ?? "BASIC", // Payment.plan non-null; для single-access — справочно
          amount,
          currency: c.currency,
          purpose: "SINGLE_ACCESS",
        },
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
    desc: "O accesare — acces unic (ImoGhid)",
    email: user.email,
    backref: `${origin}/payment-result`,
  });

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
