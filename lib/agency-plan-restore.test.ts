// Возврат личного плана при потере HUB (restorePersonalPlan и все места, где снимается HUB):
// истечение агентской подписки, removeAgencyMember, cron revokeExpiredAgencies, leaveAgency;
// обратный случай — успешное списание личной подписки не понижает HUB. Нужен PostgreSQL → только
// при DB_TESTS=1.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

const enabled = process.env.DB_TESTS === "1";
const DAY = 24 * 60 * 60 * 1000;

describe("возврат личного плана при потере HUB", { skip: !enabled && "DB_TESTS!=1" }, () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let agencyLib: typeof import("@/lib/agency");
  let bc: typeof import("@/lib/cybersource/billing-cycle");
  const run = Date.now();
  const userIds: string[] = [];
  const agencyOwners: string[] = [];
  let seq = 0;
  const realNow = Date.now();

  async function user(tag: string, over: { plan?: "BASIC" | "PRO" | "HUB" | null; planActivatedAt?: Date | null } = {}) {
    const u = await prisma.user.create({
      data: { email: `restore-${tag}-${run}@vbtest.local`, name: tag, passwordHash: "x", plan: over.plan === undefined ? "HUB" : over.plan, planActivatedAt: over.planActivatedAt ?? null },
    });
    userIds.push(u.id);
    return u.id;
  }

  async function personal(
    userId: string,
    over: { plan?: "BASIC" | "PRO"; status?: "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED"; periodEnd?: Date; graceEndsAt?: Date | null; hold?: string | null; cancel?: boolean } = {},
  ) {
    const periodEnd = over.periodEnd ?? new Date(realNow + 20 * DAY);
    return prisma.subscription.create({
      data: {
        userId,
        kind: "PERSONAL",
        plan: over.plan ?? "BASIC",
        status: over.status ?? "ACTIVE",
        provider: "CYBERSOURCE",
        amount: over.plan === "PRO" ? "500.00" : "300.00",
        currency: "MDL",
        cancelAtPeriodEnd: over.cancel ?? false,
        currentPeriodStart: new Date(periodEnd.getTime() - 30 * DAY),
        currentPeriodEnd: periodEnd,
        nextChargeAt: new Date(periodEnd.getTime() - DAY),
        graceEndsAt: over.graceEndsAt ?? null,
        billingHold: over.hold ?? null,
      },
    });
  }

  async function agencyWith(ownerId: string, memberIds: string[], planExpiresAt: Date) {
    agencyOwners.push(ownerId);
    const ag = await prisma.agency.create({ data: { ownerId, seatsPaid: 5, planExpiresAt } });
    await prisma.agencyMembership.create({ data: { agencyId: ag.id, userId: ownerId, role: "OWNER" } });
    for (const m of memberIds) await prisma.agencyMembership.create({ data: { agencyId: ag.id, userId: m, role: "MEMBER" } });
    return ag;
  }

  const get = (id: string) => prisma.user.findUniqueOrThrow({ where: { id }, select: { plan: true, planExpiresAt: true, planActivatedAt: true, sessionVersion: true } });

  before(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    agencyLib = await import("@/lib/agency");
    bc = await import("@/lib/cybersource/billing-cycle");
  });

  after(async () => {
    const payments = await prisma.payment.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    await prisma.paymentOperation.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
    await prisma.payment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.agencyMembership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.agency.deleteMany({ where: { ownerId: { in: agencyOwners } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("владелец с личной Basic: истечение агентской подписки → plan BASIC до конца личного периода, activatedAt не тронут, sessionVersion++", async () => {
    const activatedAt = new Date(realNow - 40 * DAY);
    const owner = await user("owner-exp", { planActivatedAt: activatedAt });
    const personalSub = await personal(owner, { hold: "AGENCY_MEMBER" });
    const ag = await agencyWith(owner, [], new Date(realNow + 10 * DAY));
    const periodEnd = new Date(realNow + 10 * DAY);
    const sub = await prisma.subscription.create({
      data: { userId: owner, kind: "AGENCY", plan: "HUB", agencyId: ag.id, status: "ACTIVE", cancelAtPeriodEnd: true, provider: "CYBERSOURCE", seats: 5, amount: "2250.00", currency: "MDL", currentPeriodStart: new Date(periodEnd.getTime() - 30 * DAY), currentPeriodEnd: periodEnd },
    });
    const before = await get(owner);
    const [r] = await bc.runBillingCycle({ now: new Date(periodEnd.getTime() + 60 * 1000), subscriptionId: sub.id });
    assert.equal(r.result, "expired_canceled");
    const u = await get(owner);
    assert.equal(u.plan, "BASIC");
    assert.equal(u.planExpiresAt?.toISOString(), personalSub.currentPeriodEnd.toISOString());
    assert.equal(u.planActivatedAt?.toISOString(), activatedAt.toISOString());
    assert.equal(u.sessionVersion, before.sessionVersion + 1);
    // Удержание AGENCY_MEMBER снято — списание личной подписки продолжится.
    assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { id: personalSub.id } })).billingHold, null);
    assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { id: personalSub.id } })).status, "ACTIVE");
  });

  it("владелец без личной подписки: истечение → plan null", async () => {
    const owner = await user("owner-nopers");
    const ag = await agencyWith(owner, [], new Date(realNow + 10 * DAY));
    const periodEnd = new Date(realNow + 10 * DAY);
    const sub = await prisma.subscription.create({
      data: { userId: owner, kind: "AGENCY", plan: "HUB", agencyId: ag.id, status: "ACTIVE", cancelAtPeriodEnd: true, provider: "CYBERSOURCE", seats: 5, amount: "2250.00", currency: "MDL", currentPeriodStart: new Date(periodEnd.getTime() - 30 * DAY), currentPeriodEnd: periodEnd },
    });
    await bc.runBillingCycle({ now: new Date(periodEnd.getTime() + 60 * 1000), subscriptionId: sub.id });
    const u = await get(owner);
    assert.equal(u.plan, null);
    assert.equal(u.planExpiresAt, null);
  });

  it("removeAgencyMember: участник с личной Pro → PRO; без подписки → null", async () => {
    const owner = await user("owner-rm");
    const withSub = await user("member-pro");
    const noSub = await user("member-none");
    const proSub = await personal(withSub, { plan: "PRO" });
    const ag = await agencyWith(owner, [withSub, noSub], new Date(realNow + 10 * DAY));
    await agencyLib.removeAgencyMember(ag.id, withSub);
    await agencyLib.removeAgencyMember(ag.id, noSub);
    const a = await get(withSub);
    assert.equal(a.plan, "PRO");
    assert.equal(a.planExpiresAt?.toISOString(), proSub.currentPeriodEnd.toISOString());
    assert.equal((await get(noSub)).plan, null);
  });

  it("cron revokeExpiredAgencies: участник с личной Basic → BASIC, без подписки → null, повторный запуск ничего не меняет", async () => {
    const owner = await user("owner-cron");
    const withSub = await user("cron-basic");
    const noSub = await user("cron-none");
    const sub = await personal(withSub);
    await agencyWith(owner, [withSub, noSub], new Date(realNow - DAY)); // агентство истекло
    await agencyLib.revokeExpiredAgencies(new Date());
    const a = await get(withSub);
    assert.equal(a.plan, "BASIC");
    assert.equal(a.planExpiresAt?.toISOString(), sub.currentPeriodEnd.toISOString());
    assert.equal((await get(noSub)).plan, null);
    assert.equal((await get(owner)).plan, null); // у владельца личной подписки нет
    const v = (await get(withSub)).sessionVersion;
    await agencyLib.revokeExpiredAgencies(new Date());
    assert.equal((await get(withSub)).sessionVersion, v); // уже не HUB → не трогаем
  });

  it("leaveAgency: возвращает личный план без sessionVersion++ (как и раньше при выходе)", async () => {
    const owner = await user("owner-leave");
    const member = await user("member-leave");
    await personal(member);
    await agencyWith(owner, [member], new Date(realNow + 10 * DAY));
    const before = await get(member);
    assert.deepEqual(await agencyLib.leaveAgency(member), { left: true });
    const u = await get(member);
    assert.equal(u.plan, "BASIC");
    assert.equal(u.sessionVersion, before.sessionVersion);
  });

  it("личная подписка не даёт доступ → plan null: EXPIRED, CANCELED (закрыта заменой), период закончился", async () => {
    for (const [tag, over] of [
      ["expired", { status: "EXPIRED" as const }],
      ["canceled", { status: "CANCELED" as const }],
      ["ended", { periodEnd: new Date(realNow - DAY) }],
    ] as const) {
      const owner = await user(`o-${tag}`);
      const m = await user(`m-${tag}`);
      await personal(m, over);
      const ag = await agencyWith(owner, [m], new Date(realNow + 10 * DAY));
      await agencyLib.removeAgencyMember(ag.id, m);
      const u = await get(m);
      assert.equal(u.plan, null, tag);
      assert.equal(u.planExpiresAt, null, tag);
    }
  });

  it("PAST_DUE: в grace → план до конца grace; grace закончился → null", async () => {
    const owner = await user("o-pd");
    const inGrace = await user("m-grace");
    const pastGrace = await user("m-pastgrace");
    const grace = new Date(realNow + 3 * DAY);
    await personal(inGrace, { status: "PAST_DUE", periodEnd: new Date(realNow - 2 * DAY), graceEndsAt: grace });
    await personal(pastGrace, { status: "PAST_DUE", periodEnd: new Date(realNow - 9 * DAY), graceEndsAt: new Date(realNow - 4 * DAY) });
    const ag = await agencyWith(owner, [inGrace, pastGrace], new Date(realNow + 10 * DAY));
    await agencyLib.removeAgencyMember(ag.id, inGrace);
    await agencyLib.removeAgencyMember(ag.id, pastGrace);
    const a = await get(inGrace);
    assert.equal(a.plan, "BASIC");
    assert.equal(a.planExpiresAt?.toISOString(), grace.toISOString());
    assert.equal((await get(pastGrace)).plan, null);
  });

  it("обратный случай: успешное списание личной подписки у участника с HUB не понижает его; у остальных план ставится как раньше", async () => {
    const member = await user("m-charge"); // plan HUB
    const plain = await user("m-plain", { plan: null });
    for (const [uid, expectPlan] of [[member, "HUB"], [plain, "BASIC"]] as const) {
      const sub = await personal(uid, { periodEnd: new Date(realNow + DAY) });
      const pay = await prisma.payment.create({
        data: { order: `${run}${++seq}${Math.floor(Math.random() * 1e5)}`, userId: uid, plan: "BASIC", amount: "300.00", purpose: "SUBSCRIPTION", status: "PAID", provider: "CYBERSOURCE", initiator: "MERCHANT", subscriptionId: sub.id, periodStart: sub.currentPeriodEnd, attemptNo: 1 },
      });
      const loaded = await bc.billingTestHooks.loadSub(sub.id);
      assert.equal(await bc.billingTestHooks.applySuccess(loaded, pay.id, new Date(realNow)), "charged");
      const u = await get(uid);
      assert.equal(u.plan, expectPlan);
      if (expectPlan === "HUB") assert.equal(u.planExpiresAt, null);
      else assert.ok(u.planExpiresAt && u.planExpiresAt.getTime() > realNow);
      // Подписка при этом продлена в обоих случаях.
      assert.ok((await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).currentPeriodEnd.getTime() > sub.currentPeriodEnd.getTime());
    }
  });
});
