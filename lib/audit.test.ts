// Журнал аудита: входы (LOGIN / LOGIN_FAILED), scrub meta, best-effort. Часть — без БД, часть — DB_TESTS=1.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { scrubMeta } from "@/lib/audit";

describe("scrubMeta (без БД)", () => {
  it("убирает ключи, похожие на секреты, e-mail, IP и user-agent", () => {
    const m = scrubMeta({ password: "x", newPassword: "x", token: "t", email: "a@b.c", userEmail: "a@b.c", ip: "1.1.1.1", userAgent: "u", cardNumber: "4", from: "BASIC", to: "PRO", rows: 5 });
    assert.deepEqual(m, { from: "BASIC", to: "PRO", rows: 5 });
  });
  it("только примитивы; длинные строки обрезаются; пусто → null", () => {
    assert.equal(scrubMeta({ a: { b: 1 }, c: [1] }), null);
    assert.equal(scrubMeta(undefined), null);
    assert.equal(String(scrubMeta({ s: "x".repeat(500) })!.s).length, 200);
  });
});

const enabled = process.env.DB_TESTS === "1";
describe("журнал входов", { skip: !enabled && "DB_TESTS!=1" }, () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let audit: typeof import("@/lib/audit");
  const stamp = Date.now();
  let userId = "";

  before(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    audit = await import("@/lib/audit");
    const u = await prisma.user.create({ data: { email: `aud-${stamp}@vbtest.local`, name: "aud", passwordHash: "x" } });
    userId = u.id;
  });
  after(async () => {
    await prisma.auditEvent.deleteMany({ where: { OR: [{ userId }, { actorId: userId }] } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const rows = (type: "LOGIN" | "LOGIN_FAILED" | "ADMIN_ACTION" | "EXPORT") =>
    prisma.auditEvent.findMany({ where: { userId, type }, orderBy: { createdAt: "asc" } });

  it("LOGIN: userId и время; больше ничего (нет IP/UA/meta)", async () => {
    assert.equal(await audit.recordLogin(userId), true);
    const r = (await rows("LOGIN"))[0];
    assert.equal(r.userId, userId);
    assert.ok(r.createdAt instanceof Date);
    assert.equal(r.meta, null);
    assert.equal(r.action, null);
    assert.deepEqual(Object.keys(r).sort(), ["action", "actorId", "createdAt", "id", "meta", "type", "userId"]);
  });

  it("LOGIN_FAILED: для существующего пользователя, причина кодом, без пароля и email", async () => {
    const t0 = new Date();
    assert.equal(await audit.recordLoginFailed(userId, "BAD_PASSWORD", t0), true);
    const r = (await rows("LOGIN_FAILED"))[0];
    assert.equal(r.action, "BAD_PASSWORD");
    const dump = JSON.stringify(r);
    assert.ok(!dump.includes(`aud-${stamp}`)); // ни e-mail, ни прочего
    assert.equal(r.meta, null);
  });

  it("второй отказ в течение минуты не пишется; через минуту — пишется", async () => {
    const before0 = (await rows("LOGIN_FAILED")).length;
    assert.equal(await audit.recordLoginFailed(userId, "BAD_PASSWORD"), false);
    assert.equal((await rows("LOGIN_FAILED")).length, before0);
    const later = new Date(Date.now() + 61_000);
    // окно считается от переданного now: запись трёхминутной давности не мешает
    await prisma.auditEvent.updateMany({ where: { userId, type: "LOGIN_FAILED" }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } });
    assert.equal(await audit.recordLoginFailed(userId, "BLOCKED", later), true);
    assert.equal((await rows("LOGIN_FAILED")).length, before0 + 1);
  });

  it("ADMIN_ACTION и EXPORT: actorId, действие, scrub meta", async () => {
    await audit.recordAdminAction({ actorId: userId, userId, action: "CHANGE_PLAN", meta: { from: "BASIC", to: "PRO", email: "leak@x.test" } });
    const a = (await rows("ADMIN_ACTION"))[0];
    assert.equal(a.actorId, userId);
    assert.equal(a.action, "CHANGE_PLAN");
    assert.deepEqual(a.meta, { from: "BASIC", to: "PRO" });
    await audit.recordExport({ actorId: userId, exportType: "cadastru", rows: 12, from: "2026-11-01", to: "2026-11-17", userFilter: false });
    const e = await prisma.auditEvent.findFirst({ where: { actorId: userId, type: "EXPORT" } });
    assert.equal(e?.action, "EXPORT:cadastru");
    assert.deepEqual(e?.meta, { rows: 12, from: "2026-11-01", to: "2026-11-17", userFilter: false });
  });

  it("DELETE_USER: запись переживает удаление пользователя и содержит только id", async () => {
    const { deleteUserCompletely } = await import("@/lib/delete-user");
    const victim = await prisma.user.create({ data: { email: `aud-del-${stamp}@vbtest.local`, name: "Victim Name", passwordHash: "x" } });
    await audit.recordAdminAction({ actorId: userId, userId: victim.id, action: "DELETE_USER" });
    const r = await deleteUserCompletely(victim.id);
    assert.equal(r.ok, true);
    assert.equal(await prisma.user.count({ where: { id: victim.id } }), 0);
    const ev = await prisma.auditEvent.findFirst({ where: { userId: victim.id, type: "ADMIN_ACTION" } });
    assert.equal(ev?.action, "DELETE_USER");
    assert.equal(ev?.actorId, userId);
    assert.equal(ev?.meta, null);
    const dump = JSON.stringify(ev);
    assert.ok(!dump.includes("Victim") && !dump.includes("aud-del-"));
    await prisma.auditEvent.deleteMany({ where: { userId: victim.id } });
  });

  it("сбой БД не бросает исключение (best-effort)", async () => {
    const orig = prisma.auditEvent.create;
    const origFind = prisma.auditEvent.findFirst;
    (prisma.auditEvent as unknown as { create: unknown }).create = async () => {
      throw new Error("db down");
    };
    (prisma.auditEvent as unknown as { findFirst: unknown }).findFirst = async () => {
      throw new Error("db down");
    };
    try {
      assert.equal(await audit.recordLogin(userId), false);
      assert.equal(await audit.recordLoginFailed(userId, "BAD_PASSWORD"), false);
      assert.equal(await audit.recordAdminAction({ actorId: userId, action: "BLOCK" }), false);
    } finally {
      (prisma.auditEvent as unknown as { create: unknown }).create = orig;
      (prisma.auditEvent as unknown as { findFirst: unknown }).findFirst = origFind;
    }
  });
});
