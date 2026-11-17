// Очистка журналов по сроку хранения (12 мес.) и независимость таблиц. Часть — без БД, часть — DB_TESTS=1.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AUDIT_RETENTION_MONTHS } from "@/lib/audit-config";
import { purgeAuditJournals, retentionCutoff } from "@/lib/audit-purge";

describe("срок хранения (без БД)", () => {
  it("срез = ровно 12 месяцев назад", () => {
    assert.equal(AUDIT_RETENTION_MONTHS, 12);
    assert.equal(retentionCutoff(new Date("2026-11-17T12:00:00Z")).toISOString(), "2025-11-17T12:00:00.000Z");
  });
  it("сбой одной очистки не пропускает другую", async () => {
    const calls: string[] = [];
    const r = await purgeAuditJournals(new Date("2026-11-17T12:00:00Z"), [
      { name: "a", run: async () => { calls.push("a"); throw new Error("boom"); } },
      { name: "b", run: async () => { calls.push("b"); return 7; } },
    ]);
    assert.deepEqual(calls, ["a", "b"]);
    assert.deepEqual(r, { a: -1, b: 7 });
  });
});

const enabled = process.env.DB_TESTS === "1";
describe("очистка в БД", { skip: !enabled && "DB_TESTS!=1" }, () => {
  it("старше 12 мес. удаляется в обеих таблицах, свежее остаётся", async () => {
    const { prisma } = await import("@/lib/prisma");
    const tag = `purge-${Date.now()}`;
    const old = new Date(); old.setMonth(old.getMonth() - 13);
    const fresh = new Date(); fresh.setMonth(fresh.getMonth() - 11);
    await prisma.auditEvent.createMany({ data: [
      { type: "LOGIN", userId: `${tag}-old`, createdAt: old },
      { type: "LOGIN", userId: `${tag}-new`, createdAt: fresh },
    ] });
    await prisma.usageEvent.createMany({ data: [
      { userId: `${tag}-old`, feature: "CADASTRU_CHECK", kind: "counter", createdAt: old },
      { userId: `${tag}-new`, feature: "CADASTRU_CHECK", kind: "counter", createdAt: fresh },
    ] });
    const r = await purgeAuditJournals();
    assert.ok(r.audit_events >= 1 && r.usage_events >= 1);
    assert.equal(await prisma.auditEvent.count({ where: { userId: `${tag}-old` } }), 0);
    assert.equal(await prisma.auditEvent.count({ where: { userId: `${tag}-new` } }), 1);
    assert.equal(await prisma.usageEvent.count({ where: { userId: `${tag}-old` } }), 0);
    assert.equal(await prisma.usageEvent.count({ where: { userId: `${tag}-new` } }), 1);
    await prisma.auditEvent.deleteMany({ where: { userId: `${tag}-new` } });
    await prisma.usageEvent.deleteMany({ where: { userId: `${tag}-new` } });
    await prisma.$disconnect();
  });
});
