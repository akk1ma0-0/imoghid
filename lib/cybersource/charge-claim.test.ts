// Идемпотентность автосписания на реальной БД: параллельные запуски для одной попытки создают
// ровно одну строку Payment (unique subscriptionId+periodStart+attemptNo) — второй получает
// duplicate и в CyberSource ничего не шлёт. Нужен PostgreSQL → включается только при DB_TESTS=1
// (локальная БД из .env), в обычном `npm test` пропускается.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

const enabled = process.env.DB_TESTS === "1";

describe("claimChargeAttempt — параллельный запуск", { skip: !enabled && "DB_TESTS!=1" }, () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let claimChargeAttempt: typeof import("@/lib/cybersource/payments").claimChargeAttempt;
  let userId = "";
  let subscriptionId = "";
  const periodStart = new Date("2026-12-03T15:00:00Z");
  const email = `claim-test-${Date.now()}@vbtest.local`;

  before(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    ({ claimChargeAttempt } = await import("@/lib/cybersource/payments"));
    const u = await prisma.user.create({ data: { email, name: "Claim Test", passwordHash: "x" } });
    userId = u.id;
    const s = await prisma.subscription.create({
      data: { userId, kind: "PERSONAL", plan: "BASIC", currentPeriodStart: new Date("2026-11-03T15:00:00Z"), currentPeriodEnd: periodStart },
    });
    subscriptionId = s.id;
  });

  after(async () => {
    await prisma.payment.deleteMany({ where: { subscriptionId } });
    await prisma.subscription.deleteMany({ where: { id: subscriptionId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const input = (attemptNo: number) => ({
    userId,
    payerEmail: email,
    plan: "BASIC" as const,
    subscriptionId,
    periodStart,
    attemptNo,
    amount: 300,
    customerId: "CUSTOMER_TEST",
  });

  it("5 параллельных клеймов одной попытки → 1 строка, остальные duplicate", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => claimChargeAttempt(input(1))));
    assert.equal(results.filter((r) => r.kind === "claimed").length, 1);
    assert.equal(results.filter((r) => r.kind === "duplicate").length, 4);
    assert.equal(await prisma.payment.count({ where: { subscriptionId, periodStart, attemptNo: 1 } }), 1);
    const row = await prisma.payment.findFirst({ where: { subscriptionId, attemptNo: 1 } });
    assert.equal(row?.provider, "CYBERSOURCE");
    assert.equal(row?.initiator, "MERCHANT");
    assert.equal(row?.amount, "300.00");
  });

  it("следующая попытка (attemptNo 2) — новая строка", async () => {
    const r = await claimChargeAttempt(input(2));
    assert.equal(r.kind, "claimed");
    assert.equal(await prisma.payment.count({ where: { subscriptionId, periodStart } }), 2);
  });
});
