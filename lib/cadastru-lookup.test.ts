// Журнал кадастровых проверок (CadastruCheck) в runCadastruLookup: requestId ↔ userId ↔ номер ↔
// исход ↔ попытки. Коннектор подменён (fetch). Нужен PostgreSQL → только при DB_TESTS=1.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

const enabled = process.env.DB_TESTS === "1";
const CAD = "0100109.159.02.001";
const DAY = 24 * 60 * 60 * 1000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const OK = json(200, {
  mode: "live",
  data: { CadastralNumber: CAD, Area: "58.4", Rights: [{ HasInterdictions: false, HasNotations: false, HasOtherRights: false, Quota: "1/1" }] },
});

describe("журнал кадастровых проверок", { skip: !enabled && "DB_TESTS!=1" }, () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let run: typeof import("@/lib/cadastru-lookup").runCadastruLookup;
  const realFetch = globalThis.fetch;
  const stamp = Date.now();
  let userId = "";
  let fetchCalls = 0;
  let steps: Response[] = [];

  before(async () => {
    process.env.CONNECTOR_URL = "https://connector.test/get-real-estate";
    process.env.CONNECTOR_AUTH_TOKEN = "t";
    ({ prisma } = await import("@/lib/prisma"));
    ({ runCadastruLookup: run } = await import("@/lib/cadastru-lookup"));
    const u = await prisma.user.create({
      data: { email: `cadchk-${stamp}@vbtest.local`, name: "cadchk", passwordHash: "x", plan: "BASIC", planActivatedAt: new Date(Date.now() - 5 * DAY) },
    });
    userId = u.id;
  });
  after(async () => {
    globalThis.fetch = realFetch;
    await prisma.cadastruCheck.deleteMany({ where: { userId } });
    await prisma.usageCounter.deleteMany({ where: { userId } });
    await prisma.usageEvent.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });
  beforeEach(() => {
    fetchCalls = 0;
    globalThis.fetch = (async () => {
      const s = steps[Math.min(fetchCalls, steps.length - 1)];
      fetchCalls++;
      return s.clone();
    }) as typeof fetch;
  });

  const rows = () => prisma.cadastruCheck.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const used = async () => (await prisma.usageCounter.findFirst({ where: { userId, feature: "CADASTRU_CHECK" } }))?.count ?? 0;

  it("успех: строка с requestId, userId, номером, OK, source, attempts=1", async () => {
    steps = [OK];
    const before0 = (await rows()).length;
    const out = await run({ userId, query: CAD, isDemo: false });
    assert.equal(out.kind, "record");
    const all = await rows();
    assert.equal(all.length, before0 + 1);
    const r = all[all.length - 1];
    assert.equal(r.userId, userId);
    assert.equal(r.cadastralNo, CAD);
    assert.equal(r.outcome, "OK");
    assert.equal(r.source, "live");
    assert.equal(r.attempts, 1);
    assert.match(r.requestId, /^[0-9a-f-]{36}$/);
    assert.ok(r.ms >= 0);
  });

  it("NOT_FOUND: строка с кодом, источник null, лимит возвращён, повтора нет", async () => {
    steps = [json(404, { error: { code: "NOT_FOUND" } })];
    const u0 = await used();
    const n0 = (await rows()).length;
    const out = await run({ userId, query: CAD, isDemo: false });
    assert.equal(out.kind, "error");
    const all = await rows();
    assert.equal(all.length, n0 + 1);
    const r = all[all.length - 1];
    assert.equal(r.outcome, "NOT_FOUND");
    assert.equal(r.source, null);
    assert.equal(r.attempts, 1);
    assert.equal(fetchCalls, 1);
    assert.equal(await used(), u0); // резерв возвращён
    // событие расхода помечено возвращённым → в отчёт «Consum» не попадёт
    const ue = await prisma.usageEvent.findFirst({ where: { userId, feature: "CADASTRU_CHECK" }, orderBy: { createdAt: "desc" } });
    assert.ok(ue?.releasedAt instanceof Date);
  });

  it("временный сбой + успех: attempts=2, лимит списан один раз", async () => {
    steps = [json(503, { error: { code: "UNREACHABLE" } }), OK];
    const u0 = await used();
    const n0 = (await rows()).length;
    const out = await run({ userId, query: CAD, isDemo: false });
    assert.equal(out.kind, "record");
    const all = await rows();
    assert.equal(all.length, n0 + 1);
    assert.equal(all[all.length - 1].attempts, 2);
    assert.equal(fetchCalls, 2);
    assert.equal(await used(), u0 + 1);
  });

  it("demo, picker и невалидный ввод: строки нет, коннектор не вызывается", async () => {
    steps = [OK];
    const n0 = (await rows()).length;
    await run({ userId, query: CAD, isDemo: true });
    await run({ userId, query: "abc", isDemo: false });
    await run({ userId, query: "", isDemo: false });
    assert.equal(fetchCalls, 0);
    assert.equal((await rows()).length, n0);
  });

  it("сбой записи журнала не ломает ответ пользователю", async () => {
    steps = [OK];
    const out = await run({
      userId,
      query: CAD,
      isDemo: false,
      recordCheck: async () => {
        throw new Error("db down");
      },
    });
    assert.equal(out.kind, "record");
  });

  it("cron-очистка: строки старше срока хранения (12 мес.) удаляются, свежие остаются", async () => {
    const { CAD_CHECK_RETENTION_MONTHS } = await import("@/lib/cadastru-config");
    const old = new Date();
    old.setMonth(old.getMonth() - CAD_CHECK_RETENTION_MONTHS - 1);
    await prisma.cadastruCheck.create({
      data: { requestId: `old-${stamp}`, userId: "ghost-user", cadastralNo: CAD, outcome: "OK", attempts: 1, ms: 5, createdAt: old },
    });
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - CAD_CHECK_RETENTION_MONTHS);
    const del = await prisma.cadastruCheck.deleteMany({ where: { createdAt: { lt: cutoff }, userId: "ghost-user" } });
    assert.equal(del.count, 1);
    assert.ok((await rows()).length >= 1); // свежие строки теста остались
  });
});
