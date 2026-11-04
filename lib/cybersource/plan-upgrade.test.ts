// Переход Basic → Pro на реальной БД: замена подписки после оплаты (recordCitSuccess) атомарна
// и идемпотентна. Сеть не используется (CyberSource не вызывается). Нужен PostgreSQL → только при
// DB_TESTS=1 (локальная БД из .env), в обычном `npm test` пропускается.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { TxnFacts } from "@/lib/cybersource/cit-validation";

const enabled = process.env.DB_TESTS === "1";

describe("recordCitSuccess — замена подписки Basic → Pro", { skip: !enabled && "DB_TESTS!=1" }, () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let recordCitSuccess: typeof import("@/lib/cybersource/cit").recordCitSuccess;
  const run = Date.now();
  const email = `upgrade-test-${run}@vbtest.local`;
  let userId = "";
  let oldPmId = "";
  let oldSubId = "";
  let paymentId = "";
  const now = new Date("2026-11-10T10:00:00Z");

  const facts = (over: Partial<TxnFacts> = {}): TxnFacts => ({
    id: `TXN_${run}`,
    isPayment: true,
    referenceCode: null,
    amount: "500.00",
    currency: "MDL",
    outcome: "approved",
    customerId: `CUST_NEW_${run}`,
    paymentInstrumentId: `PI_NEW_${run}`,
    networkTransactionId: `NTI_${run}`,
    approvalCode: "123456",
    processorCode: "00",
    cardLast4: "0000",
    cardBrand: "VISA",
    expMonth: 12,
    expYear: 2030,
    ...over,
  });

  async function makeOldSubAndPayment(tag: string, instrumentId: string) {
    const pm = await prisma.paymentMethod.create({
      data: { userId, tmsCustomerId: `CUST_OLD_${run}_${tag}`, tmsPaymentInstrumentId: instrumentId },
    });
    const sub = await prisma.subscription.create({
      data: {
        userId,
        kind: "PERSONAL",
        plan: "BASIC",
        status: "ACTIVE",
        provider: "CYBERSOURCE",
        paymentMethodId: pm.id,
        amount: "300.00",
        currency: "MDL",
        currentPeriodStart: new Date("2026-11-03T15:00:00Z"),
        currentPeriodEnd: new Date("2026-12-03T15:00:00Z"),
        nextChargeAt: new Date("2026-12-02T15:00:00Z"),
      },
    });
    const pay = await prisma.payment.create({
      data: {
        order: `${run}${tag.length}${Math.floor(Math.random() * 1e6)}`,
        userId,
        payerEmail: email,
        plan: "PRO",
        amount: "500.00",
        currency: "MDL",
        purpose: "SUBSCRIPTION",
        provider: "CYBERSOURCE",
        initiator: "CUSTOMER",
        replacesSubscriptionId: sub.id,
      },
    });
    await prisma.recurringConsent.create({
      data: { userId, paymentId: pay.id, textVersion: "test", amount: "500.00", currency: "MDL" },
    });
    return { pmId: pm.id, subId: sub.id, paymentId: pay.id };
  }

  before(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    ({ recordCitSuccess } = await import("@/lib/cybersource/cit"));
    const u = await prisma.user.create({ data: { email, name: "Upgrade Test", passwordHash: "x", plan: "BASIC" } });
    userId = u.id;
    const made = await makeOldSubAndPayment("a", `PI_OLD_${run}`);
    oldPmId = made.pmId;
    oldSubId = made.subId;
    paymentId = made.paymentId;
  });

  after(async () => {
    const payments = await prisma.payment.findMany({ where: { userId }, select: { id: true } });
    await prisma.recurringConsent.deleteMany({ where: { userId } });
    await prisma.paymentOperation.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
    await prisma.payment.deleteMany({ where: { userId } });
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.paymentMethod.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("сбой посреди транзакции → откат всего: старая подписка активна, новой нет", async () => {
    await assert.rejects(
      recordCitSuccess(paymentId, facts(), now, {
        afterReplace: async () => {
          throw new Error("simulated crash");
        },
      }),
      /simulated crash/,
    );
    const old = await prisma.subscription.findUniqueOrThrow({ where: { id: oldSubId } });
    assert.equal(old.status, "ACTIVE");
    assert.equal(old.nextChargeAt?.toISOString(), "2026-12-02T15:00:00.000Z");
    assert.equal(await prisma.subscription.count({ where: { userId } }), 1);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).subscriptionId, null);
    assert.equal(await prisma.paymentMethod.count({ where: { tmsPaymentInstrumentId: `PI_NEW_${run}` } }), 0);
  });

  it("5 параллельных завершений → одна новая подписка Pro, старая закрыта один раз", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => recordCitSuccess(paymentId, facts(), now)));
    const ids = new Set(results.map((r) => r.subscriptionId));
    assert.equal(ids.size, 1);
    assert.equal(results.filter((r) => r.replacedSubscription).length, 1);
    // Токен старой подписки — к удалению после транзакции (у новой другой токен).
    for (const r of results) assert.equal(r.retirePaymentMethodId, oldPmId);

    const subs = await prisma.subscription.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    assert.equal(subs.length, 2);
    const [old, fresh] = subs;
    assert.equal(old.id, oldSubId);
    assert.equal(old.status, "CANCELED");
    assert.equal(old.cancelAtPeriodEnd, false); // биллинг не «закончит» её повторно и не тронет токен
    assert.equal(old.nextChargeAt, null);
    assert.equal(old.pendingPlan, null);
    assert.equal(fresh.plan, "PRO");
    assert.equal(fresh.status, "ACTIVE");
    assert.equal(fresh.amount, "500.00");
    assert.equal(fresh.currentPeriodStart.toISOString(), now.toISOString());
    assert.equal(fresh.anchorAt?.toISOString(), now.toISOString());
    assert.equal(fresh.currentPeriodEnd.toISOString(), "2026-12-10T10:00:00.000Z");

    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    assert.equal(pay.subscriptionId, fresh.id);
    const consent = await prisma.recurringConsent.findFirstOrThrow({ where: { paymentId } });
    assert.equal(consent.subscriptionId, fresh.id);
    // Старый токен в БД ещё активен — удаляется отдельно, после транзакции (token-retire.ts).
    assert.equal((await prisma.paymentMethod.findUniqueOrThrow({ where: { id: oldPmId } })).status, "ACTIVE");
  });

  it("повтор позже — ничего нового, тот же период (а не «сейчас» повтора)", async () => {
    const later = new Date("2026-11-10T12:00:00Z");
    const r = await recordCitSuccess(paymentId, facts(), later);
    assert.equal(r.replacedSubscription, false);
    assert.equal(r.periodStart.toISOString(), now.toISOString());
    assert.equal(await prisma.subscription.count({ where: { userId } }), 2);
  });

  it("та же карта (тот же токен) → старый токен не удаляется", async () => {
    // Отдельная пара «старая подписка + оплата», где Unified Checkout вернул прежний токен.
    await prisma.subscription.updateMany({ where: { userId, status: "ACTIVE" }, data: { status: "EXPIRED" } });
    const sameInstrument = `PI_SAME_${run}`;
    const made = await makeOldSubAndPayment("b", sameInstrument);
    const r = await recordCitSuccess(
      made.paymentId,
      facts({ id: `TXN_B_${run}`, customerId: `CUST_OLD_${run}_b`, paymentInstrumentId: sameInstrument }),
      now,
    );
    assert.equal(r.replacedSubscription, true);
    assert.equal(r.retirePaymentMethodId, null);
    const pm = await prisma.paymentMethod.findUniqueOrThrow({ where: { id: made.pmId } });
    assert.equal(pm.status, "ACTIVE");
    const fresh = await prisma.subscription.findUniqueOrThrow({ where: { id: r.subscriptionId! } });
    assert.equal(fresh.paymentMethodId, made.pmId);
  });
});
