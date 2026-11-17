// UsageEvent: каждое успешное использование пишется (в т.ч. безлимит и ADMIN); отказ — нет;
// возврат резерва помечает событие releasedAt; сбой записи не блокирует действие. DB_TESTS=1.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

const enabled = process.env.DB_TESTS === "1";
const DAY = 24 * 60 * 60 * 1000;

describe("UsageEvent", { skip: !enabled && "DB_TESTS!=1" }, () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let u: typeof import("@/lib/usage");
  const stamp = Date.now();
  const ids: string[] = [];
  const activated = new Date(Date.now() - 3 * DAY);

  async function user(tag: string, over: { plan?: "BASIC" | "PRO" | null; role?: "AGENT" | "ADMIN" } = {}) {
    const plan = over.plan === undefined ? "BASIC" : over.plan;
    const x = await prisma.user.create({
      data: { email: `ue-${tag}-${stamp}@vbtest.local`, name: tag, passwordHash: "x", plan, planActivatedAt: plan ? activated : null, role: over.role ?? "AGENT" },
    });
    ids.push(x.id);
    return x;
  }
  const events = (userId: string) => prisma.usageEvent.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

  before(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    u = await import("@/lib/usage");
  });
  after(async () => {
    await prisma.usageEvent.deleteMany({ where: { userId: { in: ids } } });
    await prisma.usageCounter.deleteMany({ where: { userId: { in: ids } } });
    await prisma.singleAccessGrant.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("consumeUsage (BASIC, счётчик): событие kind=counter", async () => {
    const x = await user("basic");
    const r = await u.consumeUsage(x.id, "DOSAR_ANALYSIS");
    assert.equal(r.ok, true);
    const ev = await events(x.id);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].feature, "DOSAR_ANALYSIS");
    assert.equal(ev[0].kind, "counter");
    assert.equal(ev[0].releasedAt, null);
  });

  it("безлимит (PRO, кадастр) и ADMIN: счётчика нет, но событие kind=none есть", async () => {
    const pro = await user("pro", { plan: "PRO" });
    await u.reserveUsage(pro.id, "CADASTRU_CHECK");
    const admin = await user("adm", { role: "ADMIN" });
    await u.consumeUsage(admin.id, "CREATOR_HUB");
    assert.equal((await events(pro.id))[0].kind, "none");
    assert.equal((await events(admin.id))[0].kind, "none");
    assert.equal(await prisma.usageCounter.count({ where: { userId: { in: [pro.id, admin.id] } } }), 0);
  });

  it("отказ (нет плана / лимит исчерпан): события нет", async () => {
    const noPlan = await user("noplan", { plan: null });
    assert.equal((await u.consumeUsage(noPlan.id, "DOSAR_ANALYSIS")).ok, false);
    assert.equal((await u.reserveUsage(noPlan.id, "CADASTRU_CHECK")).ok, false);
    assert.equal((await events(noPlan.id)).length, 0);

    const full = await user("full");
    // BASIC: DOSAR_ANALYSIS = 30 → доводим счётчик до лимита
    await u.consumeUsage(full.id, "DOSAR_ANALYSIS");
    await prisma.usageCounter.updateMany({ where: { userId: full.id, feature: "DOSAR_ANALYSIS" }, data: { count: 30 } });
    const before0 = (await events(full.id)).length;
    assert.equal((await u.consumeUsage(full.id, "DOSAR_ANALYSIS")).ok, false);
    assert.equal((await events(full.id)).length, before0);
  });

  it("single-access грант: событие kind=single", async () => {
    const x = await user("single", { plan: null });
    await prisma.singleAccessGrant.create({ data: { userId: x.id, feature: "CADASTRU_CHECK" } });
    const r = await u.reserveUsage(x.id, "CADASTRU_CHECK");
    assert.equal(r.ok, true);
    assert.equal((await events(x.id))[0].kind, "single");
  });

  it("reserveUsage + releaseUsage: событие помечено releasedAt, счётчик возвращён", async () => {
    const x = await user("rel");
    const r = await u.reserveUsage(x.id, "CADASTRU_CHECK");
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.ok(r.reservation.eventId);
    assert.equal((await events(x.id))[0].releasedAt, null);
    await u.releaseUsage(r.reservation);
    const ev = await events(x.id);
    assert.equal(ev.length, 1);
    assert.ok(ev[0].releasedAt instanceof Date);
    const counter = await prisma.usageCounter.findFirst({ where: { userId: x.id, feature: "CADASTRU_CHECK" } });
    assert.equal(counter?.count, 0);
    // повторный возврат не ломает
    await u.releaseUsage(r.reservation);
  });

  it("успешный резерв (без возврата) остаётся учтённым", async () => {
    const x = await user("keep");
    const r = await u.reserveUsage(x.id, "CADASTRU_CHECK");
    assert.ok(r.ok);
    const ev = await events(x.id);
    assert.equal(ev.filter((e) => e.releasedAt === null).length, 1);
  });

  it("сбой записи события не блокирует действие", async () => {
    const x = await user("fail");
    const orig = prisma.usageEvent.create;
    (prisma.usageEvent as unknown as { create: unknown }).create = async () => {
      throw new Error("db down");
    };
    try {
      assert.equal((await u.consumeUsage(x.id, "DOSAR_ANALYSIS")).ok, true);
      const r = await u.reserveUsage(x.id, "CADASTRU_CHECK");
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.equal(r.reservation.eventId, undefined);
        await u.releaseUsage(r.reservation); // без eventId — просто возврат
      }
    } finally {
      (prisma.usageEvent as unknown as { create: unknown }).create = orig;
    }
  });
});
