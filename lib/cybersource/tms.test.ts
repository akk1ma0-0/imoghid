import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { tmsDeleteOutcome } from "@/lib/cybersource/tms";

describe("TMS DELETE: разбор ответа", () => {
  it("204/200 — удалено", () => {
    assert.deepEqual(tmsDeleteOutcome(204, null), { ok: true, alreadyGone: false, httpStatus: 204 });
    assert.deepEqual(tmsDeleteOutcome(200, {}), { ok: true, alreadyGone: false, httpStatus: 200 });
  });
  it("404 и 410 — токена уже нет, это успех", () => {
    assert.deepEqual(tmsDeleteOutcome(404, null), { ok: true, alreadyGone: true, httpStatus: 404 });
    assert.deepEqual(tmsDeleteOutcome(410, { reason: "GONE" }), { ok: true, alreadyGone: true, httpStatus: 410 });
  });
  it("прочие коды — ошибка с причиной", () => {
    assert.deepEqual(tmsDeleteOutcome(409, { reason: "CONFLICT" }), { ok: false, httpStatus: 409, reason: "CONFLICT" });
    assert.deepEqual(tmsDeleteOutcome(500, null), { ok: false, httpStatus: 500, reason: null });
    assert.deepEqual(tmsDeleteOutcome(424, { reason: 7 }), { ok: false, httpStatus: 424, reason: null });
  });
});
