import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addDaysYmd, fmtLocal, parseRange, parseYmd, todayYmd, zonedMidnightUtc } from "@/lib/audit-time";

describe("границы дней по Кишинёву", () => {
  it("зимой UTC+2, летом UTC+3", () => {
    assert.equal(zonedMidnightUtc("2026-11-17").toISOString(), "2026-11-16T22:00:00.000Z");
    assert.equal(zonedMidnightUtc("2026-07-15").toISOString(), "2026-07-14T21:00:00.000Z");
  });
  it("переход на летнее время (29.03.2026 в 03:00): полночь 29-го ещё +2, 30-го уже +3", () => {
    assert.equal(zonedMidnightUtc("2026-03-29").toISOString(), "2026-03-28T22:00:00.000Z");
    assert.equal(zonedMidnightUtc("2026-03-30").toISOString(), "2026-03-29T21:00:00.000Z");
  });
  it("fmtLocal показывает время Кишинёва", () => {
    assert.equal(fmtLocal(new Date("2026-11-17T13:50:39Z")), "2026-11-17 15:50:39");
  });
  it("todayYmd в полночь по UTC уже следующий день в Кишинёве", () => {
    assert.equal(todayYmd(new Date("2026-11-17T22:30:00Z")), "2026-11-18");
    assert.equal(todayYmd(new Date("2026-11-17T21:30:00Z")), "2026-11-17");
  });
});

describe("parseYmd / addDaysYmd", () => {
  it("проверяет реальные даты", () => {
    assert.equal(parseYmd("2026-11-17"), "2026-11-17");
    assert.equal(parseYmd("2026-02-30"), null);
    assert.equal(parseYmd("17.11.2026"), null);
    assert.equal(parseYmd(undefined), null);
    assert.equal(addDaysYmd("2026-12-31", 1), "2027-01-01");
    assert.equal(addDaysYmd("2026-11-17", -6), "2026-11-11");
  });
});

describe("parseRange", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  it("по умолчанию — последние 7 дней включая сегодня", () => {
    const r = parseRange(undefined, undefined, now);
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.fromYmd, "2026-11-11");
      assert.equal(r.toYmd, "2026-11-17");
      assert.equal(r.toExclusive.toISOString(), "2026-11-17T22:00:00.000Z");
    }
  });
  it("from после to, мусор и период больше года — ошибки", () => {
    assert.equal(parseRange("2026-11-17", "2026-11-01", now).ok, false);
    assert.equal(parseRange("abc", "2026-11-01", now).ok, false);
    assert.equal(parseRange("2025-01-01", "2026-11-17", now).ok, false);
  });
  it("ровно 366 дней допустимо", () => {
    assert.equal(parseRange("2025-11-17", "2026-11-17", now).ok, true);
  });
});
