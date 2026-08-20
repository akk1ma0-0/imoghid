import { NextResponse } from "next/server";
import type { UsageFeature } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { generateOrder } from "@/lib/payments";
import { overageFeeMdl } from "@/lib/plan-limits";
import { buildPaymentFormHtml, formatAmount, vbConfig } from "@/lib/vb-egateway";

// Фичи, для которых предусмотрена доплата sobre-limit (TARIFE.pdf: только dosar + cadastru).
const OVERAGE_FEATURES: UsageFeature[] = ["DOSAR_ANALYSIS", "CADASTRU_CHECK"];
const OVERAGE_DESC_RO: Record<string, string> = {
  DOSAR_ANALYSIS: "Supra-limit: examinarea dosarului",
  CADASTRU_CHECK: "Supra-limit: verificarea cadastrală",
};

// POST /api/payments/vb-overage-initiate { feature } — разовая доплата sobre-limit.
// Создаёт Payment(purpose=OVERAGE) и возвращает авто-сабмит форму VictoriaBank (TRTYPE=0).
// После успешного callback'а Payment становится PAID → одноразовый «грант» на одно
// превышение по фиче (см. lib/usage.ts consumeOverageGrant). Сумма — только сервер.
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
  const featureRaw = form ? String(form.get("feature") ?? "") : "";
  if (!OVERAGE_FEATURES.includes(featureRaw as UsageFeature)) {
    return NextResponse.json({ error: "Funcție invalidă pentru supra-limit." }, { status: 400 });
  }
  const feature = featureRaw as UsageFeature;

  // Согласие с условиями оплаты/возврата — обязательно (SIP), как и у подписки.
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

  // Сумма доплаты определяется планом+фичей (сервер, не клиент). null → доплата не
  // предусмотрена (напр. Pro cadastru безлимит, или нет плана) → 400.
  const fee = overageFeeMdl(user.plan, feature as "DOSAR_ANALYSIS" | "CADASTRU_CHECK");
  if (fee == null) {
    return NextResponse.json(
      { error: "Doplata sobre-limit nu este disponibilă pentru această funcție/plan." },
      { status: 400 },
    );
  }
  const amount = formatAmount(fee);

  // Уникальный ORDER (одна повторная попытка на коллизию). purpose=OVERAGE → callback НЕ
  // активирует план, а «раскрывает» грант. plan хранит текущий план (от него зависит сумма).
  let order = generateOrder();
  for (let i = 0; i < 2; i++) {
    try {
      await prisma.payment.create({
        data: {
          order,
          userId: sess.userId,
          plan: user.plan!, // != null, т.к. fee посчитан
          amount,
          currency: c.currency,
          purpose: "OVERAGE",
          overageFeature: feature,
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
    desc: `${OVERAGE_DESC_RO[feature]} (ImoGhid)`,
    email: user.email,
    backref: `${origin}/payment-result`,
  });

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
