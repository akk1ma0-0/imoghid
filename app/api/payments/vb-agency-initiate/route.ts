import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/transaction-auth";
import { generateOrder } from "@/lib/payments";
import { AGENCY_SEAT_FEE_MDL, AGENCY_MIN_SEATS } from "@/lib/plan-limits";
import { buildPaymentFormHtml, formatAmount, vbConfig } from "@/lib/vb-egateway";

// POST /api/payments/vb-agency-initiate { seats } — покупка мест HUB/Agenție (450 MDL/место).
// Новое агентство: минимум 3 места по дефолтной цене. Докупка к существующему: от 1 места по
// цене агентства (в т.ч. договорной negotiated). Сумма считается ТОЛЬКО на сервере.
// Создаёт Payment(purpose=AGENCY_SEATS, seats); само агентство создаёт/продлевает callback.
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
  const seats = form ? Number(form.get("seats")) : NaN;

  // Уже есть агентство у этого владельца? → докупка (мин. 1), цена агентства (в т.ч. договорная).
  const existing = await prisma.agency.findUnique({
    where: { ownerId: sess.userId },
    select: { pricePerSeatMdl: true },
  });
  const minSeats = existing ? 1 : AGENCY_MIN_SEATS;
  if (!Number.isInteger(seats) || seats < minSeats) {
    return NextResponse.json(
      {
        error: existing
          ? "Numărul de locuri suplimentare trebuie să fie cel puțin 1."
          : `Un pachet HUB/Agenție începe de la ${AGENCY_MIN_SEATS} locuri.`,
      },
      { status: 400 },
    );
  }

  // Владелец отметил «беру место себе» → callback создаст self-membership + plan=HUB.
  const ownerTakesSeat = form ? String(form.get("takeOwnerSeat") ?? "") === "true" : false;

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
    select: { email: true },
  });
  if (!user) return NextResponse.json({ error: "Utilizator negăsit." }, { status: 404 });

  const pricePerSeat = existing?.pricePerSeatMdl ?? AGENCY_SEAT_FEE_MDL;
  const amount = formatAmount(seats * pricePerSeat);

  // Уникальный ORDER (одна повторная попытка на коллизию). purpose=AGENCY_SEATS + seats.
  // plan=HUB — справочно (это оплата тарифа HUB); активацию/создание агентства делает callback.
  let order = generateOrder();
  for (let i = 0; i < 2; i++) {
    try {
      await prisma.payment.create({
        data: {
          order,
          userId: sess.userId,
          plan: "HUB",
          amount,
          currency: c.currency,
          purpose: "AGENCY_SEATS",
          seats,
          ownerTakesSeat,
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
    desc: `HUB/Agenție — ${seats} locuri (ImoGhid)`,
    email: user.email,
    backref: `${origin}/payment-result`,
  });

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
