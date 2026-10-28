import type { Payment } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { agencyReceiptInfo, type AgencyReceiptInfo } from "@/lib/email";
import { creditAgencySeats, materializeAgencyPlan } from "@/lib/agency";

// Выдача оплаченного: план, места агентства, гранты. Общая для платёжных провайдеров —
// вызывается ПОСЛЕ того, как провайдер подтвердил списание (VB: callback + TRTYPE=21).
// Идемпотентность обеспечивает вызывающий (клейм completionStartedAt): каждая функция
// должна выполняться для платежа ровно один раз.

// Платёж, привязанный к существующему аккаунту (userId != null после удаления аккаунта
// платёж остаётся с userId = null — такой выдавать некому).
export type AttributedPayment = Payment & { userId: string };

export function isAttributed(p: Payment): p is AttributedPayment {
  return p.userId !== null;
}

// Кому и что писать в чеке после выдачи.
export type FulfillmentResult = {
  receiptTo: string | null;
  receiptName: string | null;
  receiptAgency?: AgencyReceiptInfo; // блок «Locuri cumpărate…» (только AGENCY_SEATS)
};

// Разовая доплата sobre-limit — план НЕ активируем. Payment → PAID делает «грант»
// активным (overageConsumedAt=null); он потратится при следующем over-limit
// действии по фиче (lib/usage.ts). Это и закрывает money leak: до PAID гранта нет.
export async function fulfillOverage(payment: AttributedPayment, logTag: string): Promise<FulfillmentResult> {
  const paidUser = await prisma.user.findUnique({
    where: { id: payment.userId },
    select: { email: true, name: true },
  });
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "PAID", rc: "00" },
  });
  console.log(
    `${logTag} PAID OVERAGE ORDER=${payment.order} feature=${payment.overageFeature} user=${payment.userId}`,
  );
  return { receiptTo: paidUser?.email ?? null, receiptName: paidUser?.name ?? null };
}

// «O accesare» — план НЕ активируем. Payment → PAID + создаём 3 одноразовых гранта
// (по 1 на CADASTRU_CHECK / DOSAR_ANALYSIS / OBIECTE_CREATE). До PAID грантов нет →
// брошенная оплата ничего не выдаёт (нет money leak).
export async function fulfillSingleAccess(
  payment: AttributedPayment,
  logTag: string,
): Promise<FulfillmentResult> {
  const paidUser = await prisma.user.findUnique({
    where: { id: payment.userId },
    select: { email: true, name: true },
  });
  await prisma.$transaction([
    prisma.payment.update({ where: { id: payment.id }, data: { status: "PAID", rc: "00" } }),
    prisma.singleAccessGrant.createMany({
      data: (["CADASTRU_CHECK", "DOSAR_ANALYSIS", "OBIECTE_CREATE"] as const).map((feature) => ({
        userId: payment.userId,
        feature,
        paymentId: payment.id,
      })),
    }),
  ]);
  console.log(`${logTag} PAID SINGLE_ACCESS ORDER=${payment.order} user=${payment.userId} (3 grants)`);
  return { receiptTo: paidUser?.email ?? null, receiptName: paidUser?.name ?? null };
}

// HUB/Agenție — покупка мест. АТОМАРНО: payment→PAID и создание/продление агентства владельца
// (seatsPaid += N, planExpiresAt = now+30д) в ОДНОЙ транзакции — без рассинхрона «PAID без
// агентства». Личные планы участников НЕ трогаем. При сбое транзакция откатывается целиком и
// ошибка пробрасывается: решение о повторе (сброс клейма) — за вызывающим.
export async function fulfillAgencySeats(
  payment: AttributedPayment,
  logTag: string,
): Promise<FulfillmentResult> {
  const paidUser = await prisma.user.findUnique({
    where: { id: payment.userId },
    select: { email: true, name: true },
  });
  const agency = await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "PAID", rc: "00" },
    });
    const ag = await creditAgencySeats(payment.userId, payment.seats ?? 0, tx);
    // Владелец отметил «беру место себе»: создаём self-membership (role=OWNER) и
    // материализуем plan=HUB — в ТОЙ ЖЕ транзакции. Идемпотентно: если membership уже
    // есть (напр. докупка), пропускаем (userId в AgencyMembership @unique). Занятое место
    // считается автоматически (occupied = members.length на /app/agency).
    if (payment.ownerTakesSeat) {
      const existingMembership = await tx.agencyMembership.findUnique({
        where: { userId: payment.userId },
      });
      if (!existingMembership) {
        await tx.agencyMembership.create({
          data: { agencyId: ag.id, userId: payment.userId, role: "OWNER" },
        });
        await materializeAgencyPlan(payment.userId, tx);
      }
    }
    return ag;
  });
  console.log(
    `${logTag} PAID AGENCY_SEATS ORDER=${payment.order} owner=${payment.userId} +${payment.seats} → seatsPaid=${agency.seatsPaid}`,
  );
  return {
    receiptTo: paidUser?.email ?? null,
    receiptName: paidUser?.name ?? null,
    // Для чека: данные из записи платежа и агентства ПОСЛЕ зачисления мест (без пересчёта).
    receiptAgency: agencyReceiptInfo(payment, agency),
  };
}

// Подписка → активируем план на 30 дней от now.
export async function fulfillSubscription(
  payment: AttributedPayment,
  now: Date,
  logTag: string,
): Promise<FulfillmentResult> {
  const planExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [, paidUser] = await prisma.$transaction([
    prisma.payment.update({ where: { id: payment.id }, data: { status: "PAID", rc: "00" } }),
    prisma.user.update({
      where: { id: payment.userId },
      data: { plan: payment.plan, planActivatedAt: now, planExpiresAt },
    }),
  ]);
  console.log(`${logTag} PAID ORDER=${payment.order} plan=${payment.plan} user=${payment.userId}`);
  return { receiptTo: paidUser?.email ?? null, receiptName: paidUser?.name ?? null };
}

// Выдача по назначению платежа.
export async function fulfillPaidPayment(
  payment: AttributedPayment,
  now: Date,
  logTag: string,
): Promise<FulfillmentResult> {
  switch (payment.purpose) {
    case "OVERAGE":
      return fulfillOverage(payment, logTag);
    case "SINGLE_ACCESS":
      return fulfillSingleAccess(payment, logTag);
    case "AGENCY_SEATS":
      return fulfillAgencySeats(payment, logTag);
    case "SUBSCRIPTION":
      return fulfillSubscription(payment, now, logTag);
  }
}
