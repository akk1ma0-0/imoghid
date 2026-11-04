// Агентская подписка в биллинге на реальной БД: сумма = места × цена, сверка с согласием,
// продление двигает срок агентства, окончание снимает HUB у участников. Сеть не используется:
// сценарии без токена карты / с ранним выходом и прямые переходы через billingTestHooks.
// Нужен PostgreSQL → только при DB_TESTS=1.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

const enabled = process.env.DB_TESTS === "1";

describe("биллинг агентской подписки", { skip: !enabled && "DB_TESTS!=1" }, () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let bc: typeof import("@/lib/cybersource/billing-cycle");
  const run = Date.now();
  const userIds: string[] = [];
  const periodStart = new Date("2026-11-04T10:00:00Z");
  const periodEnd = new Date("2026-12-04T10:00:00Z");
  const chargeAt = new Date("2026-12-03T10:00:00Z");
  let seq = 0;

  async function makeUser(tag: string, plan: "HUB" | "BASIC" | null = null) {
    const u = await prisma.user.create({ data: { email: `agbill-${tag}-${run}@vbtest.local`, name: `Ag ${tag}`, passwordHash: "x", plan } });
    userIds.push(u.id);
    return u.id;
  }

  // Агентство + подписка (без токена карты — сеть не нужна) + первая оплата и согласие.
  async function makeAgencySub(tag: string, over: { seats?: number | null; price?: number; consent?: string; pendingSeats?: number; withMember?: boolean; cancel?: boolean } = {}) {
    const ownerId = await makeUser(`${tag}-owner`, "BASIC");
    const price = over.price ?? 450;
    const seats = over.seats === undefined ? 3 : over.seats;
    const agency = await prisma.agency.create({ data: { ownerId, seatsPaid: seats ?? 3, pricePerSeatMdl: price, planExpiresAt: periodEnd } });
    let memberId: string | null = null;
    if (over.withMember) {
      memberId = await makeUser(`${tag}-member`, "HUB");
      await prisma.agencyMembership.create({ data: { agencyId: agency.id, userId: memberId, role: "MEMBER" } });
    }
    const sub = await prisma.subscription.create({
      data: {
        userId: ownerId,
        kind: "AGENCY",
        plan: "HUB",
        agencyId: agency.id,
        status: over.cancel ? "CANCELED" : "ACTIVE",
        cancelAtPeriodEnd: !!over.cancel,
        provider: "CYBERSOURCE",
        anchorAt: periodStart,
        amount: "1350.00",
        currency: "MDL",
        seats,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextChargeAt: over.cancel ? null : chargeAt,
        ...(over.pendingSeats ? { pendingSeats: over.pendingSeats, pendingAmount: (over.pendingSeats * price).toFixed(2), pendingFrom: periodEnd, pendingSetAt: periodStart } : {}),
      },
    });
    const first = await prisma.payment.create({
      data: {
        order: `${run}${++seq}${Math.floor(Math.random() * 1e5)}`,
        userId: ownerId,
        plan: "HUB",
        amount: "1350.00",
        purpose: "AGENCY_SEATS",
        seats: 3,
        status: "PAID",
        provider: "CYBERSOURCE",
        initiator: "CUSTOMER",
        subscriptionId: sub.id,
      },
    });
    await prisma.recurringConsent.create({
      data: { userId: ownerId, subscriptionId: sub.id, paymentId: first.id, textVersion: "test", amount: over.consent ?? "1350.00", currency: "MDL", acceptedAt: periodStart },
    });
    return { ownerId, agencyId: agency.id, subId: sub.id, memberId };
  }

  before(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    bc = await import("@/lib/cybersource/billing-cycle");
  });

  after(async () => {
    const payments = await prisma.payment.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    await prisma.recurringConsent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.paymentOperation.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
    await prisma.payment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.agencyMembership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.agency.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("цена места изменилась (согласие 1350, теперь 3 × 400) → удержание PRICE_CHANGED, без списания", async () => {
    const { subId } = await makeAgencySub("price", { price: 400 });
    const [r] = await bc.runBillingCycle({ now: chargeAt, subscriptionId: subId });
    assert.equal(r.result, "hold:PRICE_CHANGED");
    assert.equal(await prisma.payment.count({ where: { subscriptionId: subId, initiator: "MERCHANT" } }), 0);
  });

  it("идёт докупка мест → списание ждёт", async () => {
    const { subId, ownerId } = await makeAgencySub("topup");
    await prisma.payment.create({
      data: { order: `${run}9${Math.floor(Math.random() * 1e5)}`, userId: ownerId, plan: "HUB", amount: "450.00", purpose: "AGENCY_TOPUP", seats: 1, provider: "CYBERSOURCE", initiator: "CUSTOMER", subscriptionId: subId, createdAt: new Date(chargeAt.getTime() - 10 * 60 * 1000) },
    });
    const [r] = await bc.runBillingCycle({ now: chargeAt, subscriptionId: subId });
    assert.equal(r.result, "topup_in_progress");
  });

  it("нет карты → жёсткий отказ: PAST_DUE, срок агентства = конец грейса, личный план владельца не тронут", async () => {
    const { subId, agencyId, ownerId } = await makeAgencySub("hard");
    const [r] = await bc.runBillingCycle({ now: chargeAt, subscriptionId: subId });
    assert.equal(r.result, "hard_failed");
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subId } });
    assert.equal(sub.status, "PAST_DUE");
    assert.equal(sub.graceEndsAt?.toISOString(), "2026-12-09T10:00:00.000Z");
    const ag = await prisma.agency.findUniqueOrThrow({ where: { id: agencyId } });
    assert.equal(ag.planExpiresAt?.toISOString(), "2026-12-09T10:00:00.000Z");
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
    assert.equal(owner.plan, "BASIC");
    assert.equal(owner.planExpiresAt, null);
  });

  it("успешное списание с запланированным уменьшением: места 5 → 4, pending очищен, срок агентства продлён; повтор — без второго продления", async () => {
    const { subId, agencyId, ownerId } = await makeAgencySub("success", { seats: 5, pendingSeats: 4, consent: "1800.00" });
    const pay = await prisma.payment.create({
      data: { order: `${run}8${Math.floor(Math.random() * 1e5)}`, userId: ownerId, plan: "HUB", amount: "1800.00", purpose: "AGENCY_SEATS", seats: 4, status: "PAID", provider: "CYBERSOURCE", initiator: "MERCHANT", subscriptionId: subId, periodStart: periodEnd, attemptNo: 1 },
    });
    const sub = await bc.billingTestHooks.loadSub(subId);
    assert.equal(await bc.billingTestHooks.applySuccess(sub, pay.id, chargeAt), "charged_seats_changed");
    const after1 = await prisma.subscription.findUniqueOrThrow({ where: { id: subId } });
    assert.equal(after1.seats, 4);
    assert.equal(after1.amount, "1800.00");
    assert.equal(after1.pendingSeats, null);
    assert.equal(after1.currentPeriodStart.toISOString(), periodEnd.toISOString());
    assert.equal(after1.currentPeriodEnd.toISOString(), "2027-01-04T10:00:00.000Z");
    const ag = await prisma.agency.findUniqueOrThrow({ where: { id: agencyId } });
    assert.equal(ag.seatsPaid, 4);
    assert.equal(ag.planExpiresAt?.toISOString(), "2027-01-04T10:00:00.000Z");
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).plan, "BASIC");
    assert.equal(await bc.billingTestHooks.applySuccess(sub, pay.id, chargeAt), "already_extended");
  });

  it("сумма списания с запланированным уменьшением совпадает с новым согласием (4 × 450) — не удержание", async () => {
    // Карты нет → дойдём до отказа, но не до PRICE_CHANGED: значит сумма сверена верно.
    const { subId } = await makeAgencySub("pending-terms", { seats: 5, pendingSeats: 4, consent: "1800.00" });
    const [r] = await bc.runBillingCycle({ now: chargeAt, subscriptionId: subId });
    assert.equal(r.result, "hard_failed");
  });

  it("старая подписка без seats — места из первой оплаты (3 × 450 = согласие)", async () => {
    const { subId } = await makeAgencySub("legacy", { seats: null });
    const [r] = await bc.runBillingCycle({ now: chargeAt, subscriptionId: subId });
    assert.equal(r.result, "hard_failed");
  });

  it("отменённая, период закончился → EXPIRED: срок агентства = сейчас, HUB снят у участника, план владельца не тронут", async () => {
    const { subId, agencyId, memberId, ownerId } = await makeAgencySub("expire", { withMember: true, cancel: true });
    const [r] = await bc.runBillingCycle({ now: periodEnd, subscriptionId: subId });
    assert.equal(r.result, "expired_canceled");
    assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { id: subId } })).status, "EXPIRED");
    assert.equal((await prisma.agency.findUniqueOrThrow({ where: { id: agencyId } })).planExpiresAt?.toISOString(), periodEnd.toISOString());
    const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId! } });
    assert.equal(member.plan, null);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).plan, "BASIC");
    const [again] = await bc.runBillingCycle({ now: periodEnd, subscriptionId: subId });
    assert.equal(again.result, "none");
  });
});

describe("recordCitSuccess — докупка мест (AGENCY_TOPUP)", { skip: !enabled && "DB_TESTS!=1" }, () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let recordCitSuccess: typeof import("@/lib/cybersource/cit").recordCitSuccess;
  const run = Date.now();
  let ownerId = "";
  let subId = "";
  let agencyId = "";
  let oldPmId = "";
  const now = new Date("2026-11-19T10:00:00Z");

  const facts = (paymentId: string) => ({
    id: `TXN_TOPUP_${run}_${paymentId.slice(-4)}`,
    isPayment: true,
    referenceCode: null,
    amount: "450.00",
    currency: "MDL",
    outcome: "approved" as const,
    customerId: `CUST_TOPUP_${run}`,
    paymentInstrumentId: `PI_TOPUP_${run}`,
    networkTransactionId: `NTI_TOPUP_${run}`,
    approvalCode: "654321",
    processorCode: "00",
    cardLast4: "4444",
    cardBrand: "MASTERCARD",
    expMonth: 11,
    expYear: 2031,
  });

  async function makeTopupPayment(seats: number, amount: string) {
    const p = await prisma.payment.create({
      data: { order: `${run}${seats}${Math.floor(Math.random() * 1e6)}`, userId: ownerId, plan: "HUB", amount, purpose: "AGENCY_TOPUP", seats, provider: "CYBERSOURCE", initiator: "CUSTOMER", subscriptionId: subId },
    });
    await prisma.recurringConsent.create({ data: { userId: ownerId, paymentId: p.id, textVersion: "test-topup", amount: ((3 + seats) * 450).toFixed(2), currency: "MDL" } });
    return p.id;
  }

  before(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    ({ recordCitSuccess } = await import("@/lib/cybersource/cit"));
    const u = await prisma.user.create({ data: { email: `topup-${run}@vbtest.local`, name: "Topup", passwordHash: "x" } });
    ownerId = u.id;
    const ag = await prisma.agency.create({ data: { ownerId, seatsPaid: 3, planExpiresAt: new Date("2026-12-04T10:00:00Z") } });
    agencyId = ag.id;
    const pm = await prisma.paymentMethod.create({ data: { userId: ownerId, tmsCustomerId: `CUST_OLD_${run}`, tmsPaymentInstrumentId: `PI_OLD_${run}` } });
    oldPmId = pm.id;
    const sub = await prisma.subscription.create({
      data: {
        userId: ownerId, kind: "AGENCY", plan: "HUB", agencyId, status: "ACTIVE", provider: "CYBERSOURCE", paymentMethodId: pm.id,
        amount: "1350.00", currency: "MDL", seats: 3, anchorAt: new Date("2026-11-04T10:00:00Z"),
        currentPeriodStart: new Date("2026-11-04T10:00:00Z"), currentPeriodEnd: new Date("2026-12-04T10:00:00Z"), nextChargeAt: new Date("2026-12-03T10:00:00Z"),
      },
    });
    subId = sub.id;
  });

  after(async () => {
    const payments = await prisma.payment.findMany({ where: { userId: ownerId }, select: { id: true } });
    await prisma.recurringConsent.deleteMany({ where: { userId: ownerId } });
    await prisma.paymentOperation.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
    await prisma.payment.deleteMany({ where: { userId: ownerId } });
    await prisma.subscription.deleteMany({ where: { userId: ownerId } });
    await prisma.paymentMethod.deleteMany({ where: { userId: ownerId } });
    await prisma.agency.deleteMany({ where: { ownerId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it("5 параллельных завершений → места 3 + 2 = 5 ровно один раз, период не меняется, новая карта, согласие привязано", async () => {
    const paymentId = await makeTopupPayment(2, "450.00");
    const results = await Promise.all(Array.from({ length: 5 }, () => recordCitSuccess(paymentId, facts(paymentId), now)));
    for (const r of results) {
      assert.equal(r.subscriptionId, subId);
      assert.equal(r.topup?.newSeats, 5);
      assert.equal(r.periodEnd.toISOString(), "2026-12-04T10:00:00.000Z");
    }
    // Старую карту удалить — ровно в первом (применившем) вызове.
    assert.equal(results.filter((r) => r.retirePaymentMethodId === oldPmId).length, 1);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subId }, include: { paymentMethod: true } });
    assert.equal(sub.seats, 5);
    assert.equal(sub.amount, "2250.00");
    assert.equal(sub.currentPeriodEnd.toISOString(), "2026-12-04T10:00:00.000Z");
    assert.equal(sub.paymentMethod?.tmsPaymentInstrumentId, `PI_TOPUP_${run}`);
    assert.equal(sub.initialNetworkTransactionId, `NTI_TOPUP_${run}`);
    assert.equal((await prisma.agency.findUniqueOrThrow({ where: { id: agencyId } })).seatsPaid, 5);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status, "PAID");
    const consent = await prisma.recurringConsent.findFirstOrThrow({ where: { paymentId } });
    assert.equal(consent.subscriptionId, subId);
    assert.equal(consent.amount, "2250.00");
  });

  it("повтор позже — ничего не добавляется", async () => {
    const p = await prisma.payment.findFirstOrThrow({ where: { userId: ownerId, purpose: "AGENCY_TOPUP" } });
    const r = await recordCitSuccess(p.id, facts(p.id), new Date("2026-11-20T10:00:00Z"));
    assert.equal(r.retirePaymentMethodId, null);
    assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { id: subId } })).seats, 5);
  });

  it("подписка закончилась к моменту оплаты → платёж PAID, места не добавлены (applied=false, алерт)", async () => {
    await prisma.subscription.update({ where: { id: subId }, data: { status: "EXPIRED" } });
    const paymentId = await makeTopupPayment(1, "225.00");
    const r = await recordCitSuccess(paymentId, facts(paymentId), now);
    assert.equal(r.topup?.applied, false);
    assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { id: subId } })).seats, 5);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status, "PAID");
  });
});

describe("сервис агентской подписки — уменьшение мест", { skip: !enabled && "DB_TESTS!=1" }, () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("@/lib/agency-subscription-service");
  let agencyLib: typeof import("@/lib/agency");
  const run = Date.now();
  const userIds: string[] = [];
  let ownerId = "";
  let subId = "";
  let agencyId = "";
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  const meta = { ip: "127.0.0.1", userAgent: "test" };

  before(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    svc = await import("@/lib/agency-subscription-service");
    agencyLib = await import("@/lib/agency");
    const u = await prisma.user.create({ data: { email: `reduce-${run}@vbtest.local`, name: "Reduce", passwordHash: "x" } });
    ownerId = u.id;
    userIds.push(u.id);
    const ag = await prisma.agency.create({ data: { ownerId, seatsPaid: 5, planExpiresAt: periodEnd } });
    agencyId = ag.id;
    for (const i of [1, 2, 3]) {
      const m = await prisma.user.create({ data: { email: `reduce-m${i}-${run}@vbtest.local`, name: `M${i}`, passwordHash: "x", plan: "HUB" } });
      userIds.push(m.id);
      await prisma.agencyMembership.create({ data: { agencyId, userId: m.id, role: "MEMBER" } });
    }
    const sub = await prisma.subscription.create({
      data: {
        userId: ownerId, kind: "AGENCY", plan: "HUB", agencyId, status: "ACTIVE", provider: "CYBERSOURCE", amount: "2250.00", currency: "MDL", seats: 5,
        currentPeriodStart: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000), currentPeriodEnd: periodEnd, nextChargeAt: new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000),
      },
    });
    subId = sub.id;
  });

  after(async () => {
    await prisma.recurringConsent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.inviteCode.deleteMany({ where: { agencyId } });
    await prisma.subscription.deleteMany({ where: { userId: ownerId } });
    await prisma.agencyMembership.deleteMany({ where: { agencyId } });
    await prisma.agency.deleteMany({ where: { ownerId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("ниже занятых (3 участника + 1 код) — отказ", async () => {
    await agencyLib.generateAgencyInviteCode(ownerId);
    const r = await svc.scheduleSeatReduction(ownerId, 3, meta, now);
    assert.equal(r.ok, false);
  });

  it("5 → 4: pending, согласие на 1800, коды-приглашения больше не выдаются (4 занято/зарезервировано)", async () => {
    const r = await svc.scheduleSeatReduction(ownerId, 4, meta, now);
    assert.ok(r.ok && r.changed);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subId } });
    assert.equal(sub.pendingSeats, 4);
    assert.equal(sub.pendingAmount, "1800.00");
    assert.equal(sub.pendingFrom?.toISOString(), periodEnd.toISOString());
    const c = await prisma.recurringConsent.findFirstOrThrow({ where: { subscriptionId: subId }, orderBy: { acceptedAt: "desc" } });
    assert.equal(c.amount, "1800.00");
    assert.equal(await agencyLib.agencySeatCapacity(prisma as never, agencyId, 5), 4);
    await assert.rejects(agencyLib.generateAgencyInviteCode(ownerId), /locuri libere/);
    const v = await svc.getAgencySubscriptionView(ownerId, now);
    assert.equal(v?.pendingReduction?.seats, 4);
    assert.equal(v?.canTopup, false);
  });

  it("отмена уменьшения: pending снят, новое согласие на 2250", async () => {
    const r = await svc.cancelSeatReduction(ownerId, meta, new Date(now.getTime() + 1000));
    assert.ok(r.ok && r.changed);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subId } });
    assert.equal(sub.pendingSeats, null);
    const c = await prisma.recurringConsent.findFirstOrThrow({ where: { subscriptionId: subId }, orderBy: { acceptedAt: "desc" } });
    assert.equal(c.amount, "2250.00");
    assert.equal(await agencyLib.agencySeatCapacity(prisma as never, agencyId, 5), 5);
  });

  it("отмена сохраняет запланированное уменьшение; возобновление с картой — согласие совпадает (4 × 450)", async () => {
    await svc.scheduleSeatReduction(ownerId, 4, meta, new Date(now.getTime() + 2000));
    const c = await svc.cancelAgencySubscription(ownerId, new Date(now.getTime() + 3000));
    assert.ok(c.ok && c.changed);
    let sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subId } });
    assert.equal(sub.cancelAtPeriodEnd, true);
    assert.equal(sub.pendingSeats, 4);
    assert.equal((await svc.resumeAgencySubscription(ownerId, new Date(now.getTime() + 4000))).ok, false); // карты нет
    const pm = await prisma.paymentMethod.create({ data: { userId: ownerId, tmsCustomerId: `C_R_${run}`, tmsPaymentInstrumentId: `PI_R_${run}` } });
    await prisma.subscription.update({ where: { id: subId }, data: { paymentMethodId: pm.id } });
    const r = await svc.resumeAgencySubscription(ownerId, new Date(now.getTime() + 5000));
    assert.ok(r.ok && r.changed);
    sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subId } });
    assert.equal(sub.cancelAtPeriodEnd, false);
    assert.equal(sub.pendingSeats, 4);
    await prisma.subscription.update({ where: { id: subId }, data: { paymentMethodId: null } });
    await prisma.paymentMethod.delete({ where: { id: pm.id } });
  });
});
