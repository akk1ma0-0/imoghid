// Выборки журнала: период, фильтр по пользователю, дни по Кишинёву, пагинация. DB_TESTS=1.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

const enabled = process.env.DB_TESTS === "1";

describe("выборки «Jurnal»", { skip: !enabled && "DB_TESTS!=1" }, () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let q: typeof import("@/lib/audit-queries");
  let t: typeof import("@/lib/audit-time");
  const stamp = Date.now();
  const tag = `jq-${stamp}`;
  let a = "";
  let b = "";
  const ids: string[] = [];

  before(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    q = await import("@/lib/audit-queries");
    t = await import("@/lib/audit-time");
    const ua = await prisma.user.create({ data: { email: `${tag}-a@vbtest.local`, name: "Ana", passwordHash: "x" } });
    const ub = await prisma.user.create({ data: { email: `${tag}-b@vbtest.local`, name: "Bob", passwordHash: "x" } });
    a = ua.id; b = ub.id; ids.push(a, b);

    // события расхода: 22:30 UTC 16.11 = 00:30 17.11 в Кишинёве; 21:30 UTC 16.11 = 23:30 16.11
    const ev = (userId: string, iso: string, feature: "CADASTRU_CHECK" | "DOSAR_ANALYSIS", released = false) =>
      prisma.usageEvent.create({ data: { userId, feature, kind: "counter", createdAt: new Date(iso), releasedAt: released ? new Date(iso) : null } });
    await ev(a, "2026-11-16T22:30:00Z", "CADASTRU_CHECK");
    await ev(a, "2026-11-16T22:40:00Z", "CADASTRU_CHECK");
    await ev(a, "2026-11-16T21:30:00Z", "DOSAR_ANALYSIS");
    await ev(a, "2026-11-16T22:50:00Z", "CADASTRU_CHECK", true); // возвращён → не считается
    await ev(b, "2026-11-17T09:00:00Z", "CADASTRU_CHECK");

    for (let i = 0; i < 5; i++) {
      await prisma.cadastruCheck.create({
        data: { requestId: `${tag}-r${i}`, userId: i < 4 ? a : b, cadastralNo: `0100109.159.0${i}`, outcome: i === 2 ? "NOT_FOUND" : "OK", source: i === 2 ? null : "live", attempts: 1, ms: 100 + i, createdAt: new Date(`2026-11-17T1${i}:00:00Z`) },
      });
    }
    await prisma.auditEvent.createMany({
      data: [
        { type: "LOGIN", userId: a, createdAt: new Date("2026-11-17T08:00:00Z") },
        { type: "LOGIN_FAILED", userId: a, action: "BAD_PASSWORD", createdAt: new Date("2026-11-17T08:05:00Z") },
        { type: "ADMIN_ACTION", userId: b, actorId: a, action: "BLOCK", createdAt: new Date("2026-11-17T09:00:00Z") },
        { type: "ADMIN_ACTION", userId: "gone-user-id", actorId: a, action: "DELETE_USER", createdAt: new Date("2026-11-17T09:10:00Z") },
        { type: "EXPORT", actorId: a, action: "EXPORT:cadastru", meta: { rows: 3 }, createdAt: new Date("2026-11-17T09:20:00Z") },
        { type: "LOGIN", userId: a, createdAt: new Date("2026-10-01T08:00:00Z") }, // вне периода
      ],
    });
  });
  after(async () => {
    await prisma.usageEvent.deleteMany({ where: { userId: { in: ids } } });
    await prisma.cadastruCheck.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ userId: { in: [...ids, "gone-user-id"] } }, { actorId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  const range = (from: string, to: string) => {
    const r = t.parseRange(from, to, new Date("2026-11-20T00:00:00Z"));
    assert.ok(r.ok);
    return r.ok ? r : (undefined as never);
  };
  const filter = async (from: string, to: string, email?: string) => {
    const r = range(from, to);
    return { from: r.from, toExclusive: r.toExclusive, userIds: await q.resolveUserFilter(email) };
  };
  const all = { page: 1, limit: null };

  it("фильтр по пользователю: по части e-mail; нет совпадений → пусто", async () => {
    assert.deepEqual((await q.resolveUserFilter(`${tag}-a`))?.sort(), [a]);
    assert.equal(await q.resolveUserFilter(""), null);
    assert.deepEqual(await q.resolveUserFilter("no-such-user-xyz"), []);
    const f = await filter("2026-11-01", "2026-11-30", "no-such-user-xyz");
    assert.equal((await q.queryCadastru(f, all)).total, 0);
    assert.deepEqual(await q.queryUsageByDay(f), []);
  });

  it("расход по дням: сутки Кишинёва, возвращённые не считаются", async () => {
    const f = await filter("2026-11-16", "2026-11-17", `${tag}-a`);
    const days = await q.queryUsageByDay(f);
    const d17 = days.find((d) => d.day === "2026-11-17");
    const d16 = days.find((d) => d.day === "2026-11-16");
    assert.equal(d17?.counts.CADASTRU_CHECK, 2); // 22:30 и 22:40 UTC → 17 ноября; возвращённый не учтён
    assert.equal(d16?.counts.DOSAR_ANALYSIS, 1); // 21:30 UTC → ещё 16 ноября
    assert.equal(d17?.total, 2);
  });

  it("расход по пользователям и по периоду", async () => {
    const f = await filter("2026-11-16", "2026-11-17");
    const rows = (await q.queryUsageByUser(f)).filter((r) => r.user.includes(tag));
    assert.equal(rows.find((r) => r.user.includes("-a@"))?.total, 3);
    assert.equal(rows.find((r) => r.user.includes("-b@"))?.total, 1);
    const only17 = await filter("2026-11-17", "2026-11-17", tag);
    assert.equal((await q.queryUsageByDay(only17)).find((d) => d.day === "2026-11-16"), undefined);
  });

  it("кадастровые проверки: пользователь, номер, результат; период и пагинация", async () => {
    const f = await filter("2026-11-17", "2026-11-17", tag);
    const page1 = await q.queryCadastru(f, { page: 1, limit: 2 });
    assert.equal(page1.total, 5);
    assert.equal(page1.rows.length, 2);
    const page3 = await q.queryCadastru(f, { page: 3, limit: 2 });
    assert.equal(page3.rows.length, 1);
    const everything = await q.queryCadastru(f, all);
    assert.equal(everything.rows.length, 5);
    const nf = everything.rows.find((r) => r.result === "NOT_FOUND");
    assert.ok(nf);
    assert.match(nf!.user, /@vbtest\.local$/);
    assert.match(nf!.cadastralNo, /^0100109/);
    // сортировка: новые сверху
    assert.ok(everything.rows[0].at >= everything.rows[4].at);
    const onlyB = await q.queryCadastru(await filter("2026-11-17", "2026-11-17", `${tag}-b`), all);
    assert.equal(onlyB.total, 1);
  });

  it("входы: успех и неудача с причиной; запись вне периода не попадает", async () => {
    const f = await filter("2026-11-17", "2026-11-17", `${tag}-a`);
    const r = await q.queryLogins(f, all);
    assert.equal(r.total, 2);
    assert.deepEqual(r.rows.map((x) => x.result).sort(), ["Eșuată (parolă greșită)", "Intrare reușită"]);
  });

  it("журнал действий: актёр, субъект, удалённый пользователь показан как (șters); фильтр по актёру или субъекту", async () => {
    const f = await filter("2026-11-17", "2026-11-17", `${tag}-a`);
    const r = await q.queryAdminLog(f, all);
    assert.equal(r.total, 3); // BLOCK, DELETE_USER, EXPORT: a — актёр
    const del = r.rows.find((x) => x.action === "DELETE_USER");
    assert.match(del!.subject, /^\(șters\) gone-use/);
    assert.match(del!.actor, /-a@/);
    assert.equal(r.rows.find((x) => x.type === "EXPORT")?.details, "rows=3");
    const asSubject = await q.queryAdminLog(await filter("2026-11-17", "2026-11-17", `${tag}-b`), all);
    assert.equal(asSubject.total, 1); // BLOCK над b
  });
});
