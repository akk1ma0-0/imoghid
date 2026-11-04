import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canCancelDowngrade,
  canDowngrade,
  canUpgrade,
  classifyPlanChange,
  termsForPeriod,
  type PlanChangeSub,
} from "@/lib/plan-change-rules";
import { toClientView } from "@/lib/subscription-rules";

const now = new Date("2026-11-10T10:00:00Z");
const periodEnd = new Date("2026-12-03T15:00:00Z");
const nextChargeAt = new Date("2026-12-02T15:00:00Z");

const sub = (over: Partial<PlanChangeSub> = {}): PlanChangeSub => ({
  status: "ACTIVE",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: periodEnd,
  nextChargeAt,
  billingHold: null,
  plan: "BASIC",
  amount: "300.00",
  pendingPlan: null,
  pendingAmount: null,
  pendingFrom: null,
  ...over,
});
const ctx = { now, chargeInFlight: false };

describe("classifyPlanChange", () => {
  it("Basic → Pro — upgrade, Pro → Basic — downgrade, тот же — same, прочее — invalid", () => {
    assert.equal(classifyPlanChange("BASIC", "PRO"), "upgrade");
    assert.equal(classifyPlanChange("PRO", "BASIC"), "downgrade");
    assert.equal(classifyPlanChange("PRO", "PRO"), "same");
    assert.equal(classifyPlanChange("HUB", "PRO"), "invalid");
    assert.equal(classifyPlanChange("BASIC", "HUB"), "invalid");
  });
});

describe("canUpgrade (Basic → Pro)", () => {
  it("активная Basic — можно", () => assert.deepEqual(canUpgrade(sub(), ctx), { ok: true }));
  it("просрочка (PAST_DUE) — можно: новая оплата закрывает старую подписку", () =>
    assert.deepEqual(canUpgrade(sub({ status: "PAST_DUE", nextChargeAt: null }), ctx), { ok: true }));
  it("отменённая, период идёт — можно (новое согласие)", () =>
    assert.deepEqual(canUpgrade(sub({ cancelAtPeriodEnd: true }), ctx), { ok: true }));
  it("уже Pro — нельзя", () => assert.deepEqual(canUpgrade(sub({ plan: "PRO" }), ctx), { ok: false, reason: "NOT_BASIC" }));
  it("подписка закончилась — нельзя", () => {
    assert.deepEqual(canUpgrade(sub({ status: "EXPIRED" }), ctx), { ok: false, reason: "ENDED" });
    assert.deepEqual(canUpgrade(sub(), { ...ctx, now: periodEnd }), { ok: false, reason: "ENDED" });
  });
  it("удержание админом — нельзя", () => assert.deepEqual(canUpgrade(sub({ billingHold: "REVIEW" }), ctx), { ok: false, reason: "HOLD" }));
  it("идёт автосписание с неясным исходом — нельзя (двойная оплата)", () =>
    assert.deepEqual(canUpgrade(sub(), { ...ctx, chargeInFlight: true }), { ok: false, reason: "CHARGE_IN_PROGRESS" }));
});

describe("canDowngrade (Pro → Basic со следующего периода)", () => {
  const pro = (over: Partial<PlanChangeSub> = {}) => sub({ plan: "PRO", amount: "500.00", ...over });
  it("активная Pro — можно", () => assert.deepEqual(canDowngrade(pro(), ctx), { ok: true }));
  it("Basic — нельзя", () => assert.deepEqual(canDowngrade(sub(), ctx), { ok: false, reason: "NOT_PRO" }));
  it("PAST_DUE — нельзя, сначала оплата", () =>
    assert.deepEqual(canDowngrade(pro({ status: "PAST_DUE" }), ctx), { ok: false, reason: "PAST_DUE" }));
  it("отменённая — нельзя", () => {
    assert.deepEqual(canDowngrade(pro({ cancelAtPeriodEnd: true }), ctx), { ok: false, reason: "CANCELED" });
    assert.deepEqual(canDowngrade(pro({ status: "CANCELED", cancelAtPeriodEnd: true }), ctx), { ok: false, reason: "CANCELED" });
  });
  it("повтор: смена уже запланирована", () =>
    assert.deepEqual(canDowngrade(pro({ pendingPlan: "BASIC", pendingAmount: "300.00", pendingFrom: periodEnd }), ctx), {
      ok: false,
      reason: "ALREADY_SCHEDULED",
    }));
  it("подошёл срок списания или оно идёт — ждём исхода", () => {
    assert.deepEqual(canDowngrade(pro(), { ...ctx, now: nextChargeAt }), { ok: false, reason: "RENEWAL_IN_PROGRESS" });
    assert.deepEqual(canDowngrade(pro(), { ...ctx, chargeInFlight: true }), { ok: false, reason: "RENEWAL_IN_PROGRESS" });
  });
  it("удержание админом — нельзя", () => assert.deepEqual(canDowngrade(pro({ billingHold: "PRICE_CHANGED" }), ctx), { ok: false, reason: "HOLD" }));
  it("подписка закончилась — нельзя", () => assert.deepEqual(canDowngrade(pro({ status: "EXPIRED" }), ctx), { ok: false, reason: "ENDED" }));
});

describe("canCancelDowngrade", () => {
  const scheduled = sub({ plan: "PRO", amount: "500.00", pendingPlan: "BASIC", pendingAmount: "300.00", pendingFrom: periodEnd });
  it("запланирована, списание не началось — можно", () => assert.deepEqual(canCancelDowngrade(scheduled, ctx), { ok: true }));
  it("нечего отменять", () => assert.deepEqual(canCancelDowngrade(sub({ plan: "PRO" }), ctx), { ok: false, reason: "NOT_SCHEDULED" }));
  it("срок списания наступил или оно идёт — уже нельзя", () => {
    assert.deepEqual(canCancelDowngrade(scheduled, { ...ctx, now: nextChargeAt }), { ok: false, reason: "RENEWAL_IN_PROGRESS" });
    assert.deepEqual(canCancelDowngrade(scheduled, { ...ctx, chargeInFlight: true }), { ok: false, reason: "RENEWAL_IN_PROGRESS" });
    assert.deepEqual(canCancelDowngrade(scheduled, { ...ctx, now: periodEnd }), { ok: false, reason: "RENEWAL_IN_PROGRESS" });
  });
});

describe("termsForPeriod — сумма при продлении", () => {
  const scheduled = sub({ plan: "PRO", amount: "500.00", pendingPlan: "BASIC", pendingAmount: "300.00", pendingFrom: periodEnd });
  it("период с pendingFrom — новый план и меньшая сумма", () =>
    assert.deepEqual(termsForPeriod(scheduled, periodEnd), { plan: "BASIC", amount: "300.00", changed: true }));
  it("более поздний период (повтор после неудачи и т.п.) — тоже новый план", () =>
    assert.deepEqual(termsForPeriod(scheduled, new Date("2027-01-03T15:00:00Z")), { plan: "BASIC", amount: "300.00", changed: true }));
  it("период до pendingFrom — текущий план и сумма", () =>
    assert.deepEqual(termsForPeriod(scheduled, new Date("2026-11-03T15:00:00Z")), { plan: "PRO", amount: "500.00", changed: false }));
  it("без смены — сумма подписки", () => assert.deepEqual(termsForPeriod(sub(), periodEnd), { plan: "BASIC", amount: "300.00", changed: false }));
});

describe("toClientView — смена плана", () => {
  const base = {
    graceEndsAt: null,
    currency: "MDL",
  };
  const pc = { chargeInFlight: false, prices: { BASIC: "300.00", PRO: "500.00" } };
  it("Basic: предложить Pro за 500, без понижения", () => {
    const v = toClientView({ ...sub(), ...base }, null, now, null, pc)!;
    assert.deepEqual(v.upgradeTo, { plan: "PRO", amount: "500.00" });
    assert.equal(v.downgradeTo, null);
    assert.equal(v.pendingChange, null);
    assert.equal(v.canCancelPendingChange, false);
  });
  it("Pro: предложить Basic за 300", () => {
    const v = toClientView({ ...sub({ plan: "PRO", amount: "500.00" }), ...base }, null, now, null, pc)!;
    assert.equal(v.upgradeTo, null);
    assert.deepEqual(v.downgradeTo, { plan: "BASIC", amount: "300.00" });
  });
  it("запланированная смена — дата и сумма, можно отменить; повторно понизить нельзя", () => {
    const v = toClientView(
      { ...sub({ plan: "PRO", amount: "500.00", pendingPlan: "BASIC", pendingAmount: "300.00", pendingFrom: periodEnd }), ...base },
      null,
      now,
      null,
      pc,
    )!;
    assert.deepEqual(v.pendingChange, { plan: "BASIC", amount: "300.00", from: periodEnd.toISOString() });
    assert.equal(v.canCancelPendingChange, true);
    assert.equal(v.downgradeTo, null);
  });
  it("без контекста смены (старые вызовы) — кнопок смены нет", () => {
    const v = toClientView({ ...sub(), ...base }, null, now, null)!;
    assert.equal(v.upgradeTo, null);
    assert.equal(v.downgradeTo, null);
  });
});
