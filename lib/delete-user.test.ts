// Удаление аккаунта (deleteUserCompletely) и CyberSource: закрытие подписок, удаление токенов
// карт у банка (TMS подменён — без сети), отказ при сбое токена и при платеже «в пути»,
// повторный вызов, освобождение участников агентства (и VictoriaBank без подписки).
// Нужен PostgreSQL → только при DB_TESTS=1.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { TmsResult } from "@/lib/cybersource/tms";
import type { TmsDeleter } from "@/lib/cybersource/token-retire";

const enabled = process.env.DB_TESTS === "1";
const DAY = 24 * 60 * 60 * 1000;

type Call = { op: "customer" | "instrument"; customerId: string; instrumentId?: string };
function fakeTms(result: TmsResult = { ok: true, alreadyGone: false, httpStatus: 204 }) {
  const calls: Call[] = [];
  const tms: TmsDeleter = {
    deleteCustomer: async (customerId) => {
      calls.push({ op: "customer", customerId });
      return result;
    },
    deletePaymentInstrument: async (customerId, instrumentId) => {
      calls.push({ op: "instrument", customerId, instrumentId });
      return result;
    },
  };
  return { tms, calls };
}
const FAIL: TmsResult = { ok: false, httpStatus: 0, reason: "timeout" };

describe("удаление аккаунта и CyberSource", { skip: !enabled && "DB_TESTS!=1" }, () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let deleteUserCompletely: typeof import("@/lib/delete-user").deleteUserCompletely;
  let decide: typeof import("@/lib/billing-period").decideSubscriptionAction;
  const run = Date.now();
  const realNow = new Date();
  const userIds: string[] = [];
  const paymentIds: string[] = [];
  let seq = 0;

  async function user(tag: string, plan: "BASIC" | "PRO" | "HUB" | null = "BASIC") {
    const u = await prisma.user.create({
      data: { email: `del-${tag}-${run}@vbtest.local`, name: tag, passwordHash: "x", plan, planActivatedAt: plan ? new Date(realNow.getTime() - 5 * DAY) : null },
    });
    userIds.push(u.id);
    return u;
  }

  async function card(userId: string) {
    seq++;
    return prisma.paymentMethod.create({
      data: { userId, provider: "CYBERSOURCE", tmsCustomerId: `CUST-${run}-${seq}`, tmsPaymentInstrumentId: `PI-${run}-${seq}`, cardLast4: "1111", status: "ACTIVE" },
    });
  }

  async function sub(userId: string, over: { kind?: "PERSONAL" | "AGENCY"; plan?: "BASIC" | "PRO" | "HUB"; pmId?: string | null; agencyId?: string | null; cancel?: boolean } = {}) {
    const periodEnd = new Date(realNow.getTime() + 20 * DAY);
    return prisma.subscription.create({
      data: {
        userId,
        kind: over.kind ?? "PERSONAL",
        plan: over.plan ?? "BASIC",
        agencyId: over.agencyId ?? null,
        status: "ACTIVE",
        provider: "CYBERSOURCE",
        paymentMethodId: over.pmId ?? null,
        amount: over.kind === "AGENCY" ? "1350.00" : "300.00",
        currency: "MDL",
        seats: over.kind === "AGENCY" ? 3 : null,
        cancelAtPeriodEnd: over.cancel ?? false,
        currentPeriodStart: new Date(periodEnd.getTime() - 30 * DAY),
        currentPeriodEnd: periodEnd,
        nextChargeAt: new Date(periodEnd.getTime() - DAY),
        pendingSeats: over.kind === "AGENCY" ? 2 : null,
      },
    });
  }

  async function payment(userId: string, over: { provider?: "CYBERSOURCE" | "VICTORIABANK"; status?: "PAID" | "PENDING" | "UNKNOWN"; subscriptionId?: string; ageMs?: number; payerEmail?: string | null } = {}) {
    seq++;
    const p = await prisma.payment.create({
      data: {
        order: `${run}`.slice(-8) + String(seq).padStart(4, "0"),
        userId,
        payerEmail: over.payerEmail === undefined ? null : over.payerEmail,
        plan: "BASIC",
        amount: "300.00",
        status: over.status ?? "PAID",
        provider: over.provider ?? "CYBERSOURCE",
        subscriptionId: over.subscriptionId ?? null,
        createdAt: new Date(realNow.getTime() - (over.ageMs ?? 3 * DAY)),
      },
    });
    paymentIds.push(p.id);
    return p;
  }

  async function agencyWith(ownerId: string, memberIds: string[]) {
    const ag = await prisma.agency.create({ data: { ownerId, seatsPaid: 3, planExpiresAt: new Date(realNow.getTime() + 20 * DAY) } });
    await prisma.agencyMembership.create({ data: { agencyId: ag.id, userId: ownerId, role: "OWNER" } });
    for (const m of memberIds) await prisma.agencyMembership.create({ data: { agencyId: ag.id, userId: m, role: "MEMBER" } });
    return ag;
  }

  const exists = async (id: string) => (await prisma.user.count({ where: { id } })) === 1;
  const ops = (actorUserId: string) => prisma.paymentOperation.findMany({ where: { actorUserId, type: "TOKEN_DELETE" }, orderBy: { createdAt: "asc" } });

  before(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    ({ deleteUserCompletely } = await import("@/lib/delete-user"));
    ({ decideSubscriptionAction: decide } = await import("@/lib/billing-period"));
  });

  after(async () => {
    await prisma.paymentOperation.deleteMany({ where: { OR: [{ paymentId: { in: paymentIds } }, { actorUserId: { in: userIds } }] } });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.paymentMethod.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.agencyMembership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.agency.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("без подписок и карт CyberSource: удаление как раньше, TMS не вызывается, платёж остаётся с payerEmail", async () => {
    const u = await user("none");
    const p = await payment(u.id, { provider: "VICTORIABANK", payerEmail: null });
    const { tms, calls } = fakeTms();
    assert.deepEqual(await deleteUserCompletely(u.id, { tms }), { ok: true });
    assert.equal(await exists(u.id), false);
    assert.equal(calls.length, 0);
    const kept = await prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    assert.equal(kept.userId, null);
    assert.equal(kept.payerEmail, u.email);
  });

  it("личная подписка: токен удалён у банка, записан TOKEN_DELETE, аккаунт удалён, платёж сохранён", async () => {
    const u = await user("personal");
    const pm = await card(u.id);
    const s = await sub(u.id, { pmId: pm.id });
    const p = await payment(u.id, { subscriptionId: s.id, payerEmail: u.email });
    const { tms, calls } = fakeTms();
    assert.deepEqual(await deleteUserCompletely(u.id, { tms }), { ok: true });
    assert.equal(await exists(u.id), false);
    assert.deepEqual(calls, [{ op: "customer", customerId: pm.tmsCustomerId }]);
    const [op] = await ops(u.id);
    assert.equal(op.outcome, "deleted");
    assert.equal(op.httpStatus, 204);
    assert.equal(op.paymentId, p.id);
    assert.equal(await prisma.subscription.count({ where: { id: s.id } }), 0);
    assert.equal(await prisma.paymentMethod.count({ where: { id: pm.id } }), 0);
    const kept = await prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    assert.equal(kept.userId, null);
    assert.equal(kept.subscriptionId, null);
    assert.equal(kept.payerEmail, u.email);
  });

  it("агентская подписка владельца: токен удалён; участник с личной Basic → BASIC, без подписки → null (sessionVersion++)", async () => {
    const owner = await user("ag-owner", "HUB");
    const mBasic = await user("ag-m-basic", "HUB");
    const mNone = await user("ag-m-none", "HUB");
    const mPersonal = await sub(mBasic.id);
    const ag = await agencyWith(owner.id, [mBasic.id, mNone.id]);
    const pm = await card(owner.id);
    await sub(owner.id, { kind: "AGENCY", plan: "HUB", agencyId: ag.id, pmId: pm.id });
    const { tms, calls } = fakeTms();
    assert.deepEqual(await deleteUserCompletely(owner.id, { tms }), { ok: true });
    assert.equal(await exists(owner.id), false);
    assert.equal(calls.length, 1);
    assert.equal(await prisma.agency.count({ where: { id: ag.id } }), 0);
    const b = await prisma.user.findUniqueOrThrow({ where: { id: mBasic.id } });
    assert.equal(b.plan, "BASIC");
    assert.equal(b.planExpiresAt?.toISOString(), mPersonal.currentPeriodEnd.toISOString());
    assert.equal(b.sessionVersion, mBasic.sessionVersion + 1);
    const n = await prisma.user.findUniqueOrThrow({ where: { id: mNone.id } });
    assert.equal(n.plan, null);
    assert.equal(n.planExpiresAt, null);
    assert.equal(n.sessionVersion, mNone.sessionVersion + 1);
    // Личная подписка участника не тронута.
    assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { id: mPersonal.id } })).status, "ACTIVE");
  });

  it("личная и агентская подписки сразу: обе карты удалены у банка", async () => {
    const u = await user("both", "HUB");
    const ag = await agencyWith(u.id, []);
    const pm1 = await card(u.id);
    const pm2 = await card(u.id);
    await sub(u.id, { pmId: pm1.id, cancel: true });
    await sub(u.id, { kind: "AGENCY", plan: "HUB", agencyId: ag.id, pmId: pm2.id });
    const { tms, calls } = fakeTms();
    assert.deepEqual(await deleteUserCompletely(u.id, { tms }), { ok: true });
    assert.equal(await exists(u.id), false);
    assert.deepEqual(
      calls.map((c) => c.customerId).sort(),
      [pm1.tmsCustomerId, pm2.tmsCustomerId].sort(),
    );
    assert.equal((await ops(u.id)).filter((o) => o.outcome === "deleted").length, 2);
  });

  it("сбой удаления токена: аккаунт остаётся, подписка закрыта и не идёт в биллинг, карта ACTIVE; повторный вызов завершает удаление", async () => {
    const u = await user("fail");
    const pm = await card(u.id);
    const s = await sub(u.id, { pmId: pm.id });
    const failing = fakeTms(FAIL);
    const r = await deleteUserCompletely(u.id, { tms: failing.tms });
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.status, 503);
    assert.match(!r.ok ? r.message : "", /Abonamentul a fost oprit/);
    assert.equal(await exists(u.id), true);
    const closed = await prisma.subscription.findUniqueOrThrow({ where: { id: s.id } });
    assert.equal(closed.status, "CANCELED");
    assert.equal(closed.cancelAtPeriodEnd, false);
    assert.equal(closed.nextChargeAt, null);
    assert.equal(closed.billingHold, "ACCOUNT_DELETION");
    assert.ok(closed.canceledAt);
    // Биллинг: ни списания, ни письма, ни expire — ни сейчас, ни в срок списания, ни после конца периода.
    for (const at of [realNow, new Date(s.nextChargeAt!.getTime() + 60_000), new Date(s.currentPeriodEnd.getTime() + DAY)]) {
      assert.equal(decide(closed, at), "none");
    }
    assert.equal((await prisma.paymentMethod.findUniqueOrThrow({ where: { id: pm.id } })).status, "ACTIVE");
    assert.equal((await ops(u.id))[0].outcome, "error");

    // Повторный сбой — снова 503, состояние то же (идемпотентно).
    const again = await deleteUserCompletely(u.id, { tms: fakeTms(FAIL).tms });
    assert.equal(!again.ok && again.status, 503);
    assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { id: s.id } })).canceledAt?.toISOString(), closed.canceledAt!.toISOString());

    // Банк снова доступен — повтор удаляет токен и аккаунт.
    const ok = fakeTms();
    assert.deepEqual(await deleteUserCompletely(u.id, { tms: ok.tms }), { ok: true });
    assert.equal(ok.calls.length, 1);
    assert.equal(await exists(u.id), false);
    assert.deepEqual((await ops(u.id)).map((o) => o.outcome), ["error", "error", "deleted"]);
  });

  it("идёт оплата (PENDING моложе часа): 409, ничего не изменено; старая PENDING (2 ч) не мешает", async () => {
    const u = await user("inflight");
    const pm = await card(u.id);
    const s = await sub(u.id, { pmId: pm.id });
    const p = await payment(u.id, { status: "PENDING", subscriptionId: s.id, ageMs: 10 * 60 * 1000 });
    const { tms, calls } = fakeTms();
    const r = await deleteUserCompletely(u.id, { tms });
    assert.equal(!r.ok && r.status, 409);
    assert.match(!r.ok ? r.message : "", /plată este în curs/);
    assert.equal(calls.length, 0);
    assert.equal(await exists(u.id), true);
    const same = await prisma.subscription.findUniqueOrThrow({ where: { id: s.id } });
    assert.equal(same.status, "ACTIVE");
    assert.equal(same.billingHold, null);
    assert.ok(same.nextChargeAt);
    assert.equal((await prisma.paymentMethod.findUniqueOrThrow({ where: { id: pm.id } })).status, "ACTIVE");

    await prisma.payment.update({ where: { id: p.id }, data: { createdAt: new Date(realNow.getTime() - 2 * 60 * 60 * 1000) } });
    assert.deepEqual(await deleteUserCompletely(u.id, { tms }), { ok: true });
    assert.equal(await exists(u.id), false);
  });

  it("TMS отвечает 404/410 (токена уже нет) — это успех: аккаунт удалён, операция already_gone", async () => {
    const u = await user("gone");
    const pm1 = await card(u.id);
    await sub(u.id, { pmId: pm1.id });
    const { tms } = fakeTms({ ok: true, alreadyGone: true, httpStatus: 410 });
    assert.deepEqual(await deleteUserCompletely(u.id, { tms }), { ok: true });
    assert.equal(await exists(u.id), false);
    const [op] = await ops(u.id);
    assert.equal(op.outcome, "already_gone");
    assert.equal(op.httpStatus, 410);
  });

  it("агентство VictoriaBank без подписки: владелец удалён, участники без HUB (личный план или null), TMS не вызывается", async () => {
    const owner = await user("vb-owner", "HUB");
    const mPro = await user("vb-m-pro", "HUB");
    const mNone = await user("vb-m-none", "HUB");
    const proSub = await sub(mPro.id, { plan: "PRO" });
    const ag = await agencyWith(owner.id, [mPro.id, mNone.id]);
    const p = await payment(owner.id, { provider: "VICTORIABANK", payerEmail: null });
    const { tms, calls } = fakeTms();
    assert.deepEqual(await deleteUserCompletely(owner.id, { tms }), { ok: true });
    assert.equal(calls.length, 0);
    assert.equal(await exists(owner.id), false);
    assert.equal(await prisma.agency.count({ where: { id: ag.id } }), 0);
    assert.equal(await prisma.agencyMembership.count({ where: { userId: { in: [mPro.id, mNone.id] } } }), 0);
    const pr = await prisma.user.findUniqueOrThrow({ where: { id: mPro.id } });
    assert.equal(pr.plan, "PRO");
    assert.equal(pr.planExpiresAt?.toISOString(), proSub.currentPeriodEnd.toISOString());
    const n = await prisma.user.findUniqueOrThrow({ where: { id: mNone.id } });
    assert.equal(n.plan, null);
    assert.equal(n.sessionVersion, mNone.sessionVersion + 1);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).payerEmail, owner.email);
  });

  it("удаление участника агентства: его карта удалена, агентство и остальные участники не тронуты", async () => {
    const owner = await user("mem-owner", "HUB");
    const other = await user("mem-other", "HUB");
    const member = await user("mem-self", "HUB");
    const ag = await agencyWith(owner.id, [other.id, member.id]);
    const pm = await card(member.id);
    await sub(member.id, { pmId: pm.id });
    const { tms, calls } = fakeTms();
    assert.deepEqual(await deleteUserCompletely(member.id, { tms }), { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(await exists(member.id), false);
    assert.equal(await prisma.agency.count({ where: { id: ag.id } }), 1);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).plan, "HUB");
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).plan, "HUB");
  });
});
