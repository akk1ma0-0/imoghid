import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  agencyChargeTerms,
  canCancelReduction,
  canReduce,
  canTopup,
  effectiveSeats,
  prorateTopup,
  topupDays,
  seatsAmount,
  seatsForPeriod,
  toAgencyView,
  type AgencySub,
} from "@/lib/agency-subscription-rules";

const periodStart = new Date("2026-11-04T10:00:00Z");
const periodEnd = new Date("2026-12-04T10:00:00Z"); // 30 дней
const nextChargeAt = new Date("2026-12-03T10:00:00Z");
const now = new Date("2026-11-19T10:00:00Z"); // ровно середина периода

const sub = (over: Partial<AgencySub> = {}): AgencySub => ({
  status: "ACTIVE",
  cancelAtPeriodEnd: false,
  currentPeriodStart: periodStart,
  currentPeriodEnd: periodEnd,
  nextChargeAt,
  billingHold: null,
  seats: 3,
  pendingSeats: null,
  pendingAmount: null,
  pendingFrom: null,
  ...over,
});
const ctx = { now, chargeInFlight: false };

describe("seatsAmount / effectiveSeats", () => {
  it("места × цена", () => {
    assert.equal(seatsAmount(3, 450), "1350.00");
    assert.equal(seatsAmount(5, 399), "1995.00");
  });
  it("seats подписки, иначе места первой оплаты, иначе null", () => {
    assert.equal(effectiveSeats(4, 3), 4);
    assert.equal(effectiveSeats(null, 3), 3);
    assert.equal(effectiveSeats(0, null), null);
  });
});

describe("prorateTopup — пропорция оставшихся дней периода", () => {
  const base = { pricePerSeatMdl: 450, periodStart, periodEnd };
  const day = 24 * 60 * 60 * 1000;
  it("середина периода (15 из 30 дней): 2 места × 450 × 15/30 = 450.00", () =>
    assert.equal(prorateTopup({ ...base, seatsToAdd: 2, now }), "450.00"));
  it("начатый день считается целым: сумма не меняется в течение суток", () => {
    const a = prorateTopup({ ...base, seatsToAdd: 1, now: new Date(now.getTime() + 60 * 1000) });
    const b = prorateTopup({ ...base, seatsToAdd: 1, now: new Date(now.getTime() + day - 60 * 1000) });
    assert.equal(a, b);
    assert.equal(a, "225.00"); // 15 дней (14 полных + начатый)
    assert.deepEqual(topupDays(periodStart, periodEnd, new Date(now.getTime() + 60 * 1000)), { left: 15, total: 30 });
  });
  it("начало периода — полная сумма, после конца — минимум", () => {
    assert.equal(prorateTopup({ ...base, seatsToAdd: 1, now: periodStart }), "450.00");
    assert.equal(prorateTopup({ ...base, seatsToAdd: 1, now: new Date(periodEnd.getTime() + 1000) }), "10.00");
  });
  it("округление half-up до 0,01", () => {
    // 1 × 100 × 10/30 = 33.333… → 33.33; 1 × 100 × 20/30 = 66.666… → 66.67; 2001 × 15/30 = 1000.50
    assert.equal(prorateTopup({ ...base, pricePerSeatMdl: 100, seatsToAdd: 1, now: new Date(periodEnd.getTime() - 10 * day) }), "33.33");
    assert.equal(prorateTopup({ ...base, pricePerSeatMdl: 100, seatsToAdd: 1, now: new Date(periodEnd.getTime() - 20 * day) }), "66.67");
    assert.equal(prorateTopup({ ...base, pricePerSeatMdl: 2001, seatsToAdd: 1, now }), "1000.50");
    const p2s = new Date("2026-11-01T00:00:00Z");
    const p2e = new Date("2026-11-04T00:00:00Z"); // 3 дня
    // 1 × 1001 × 1/3 = 333.666… → 333.67; 1 × 1001 × 2/3 = 667.333… → 667.33
    assert.equal(prorateTopup({ seatsToAdd: 1, pricePerSeatMdl: 1001, periodStart: p2s, periodEnd: p2e, now: new Date("2026-11-03T12:00:00Z") }), "333.67");
    assert.equal(prorateTopup({ seatsToAdd: 1, pricePerSeatMdl: 1001, periodStart: p2s, periodEnd: p2e, now: new Date("2026-11-02T12:00:00Z") }), "667.33");
  });
  it("последний день — минимум 10 MDL (1 × 200 × 1/30 = 6.67 → 10.00)", () => {
    const lastHour = new Date(periodEnd.getTime() - 60 * 60 * 1000);
    assert.equal(prorateTopup({ ...base, pricePerSeatMdl: 200, seatsToAdd: 1, now: lastHour }), "10.00");
    assert.equal(prorateTopup({ ...base, seatsToAdd: 1, now: lastHour }), "15.00"); // 450/30 — выше минимума
  });
  it("февраль (28 дней) — своя длина периода", () => {
    const fs = new Date("2027-01-31T10:00:00Z");
    const fe = new Date("2027-02-28T10:00:00Z");
    assert.deepEqual(topupDays(fs, fe, new Date("2027-02-14T10:00:00Z")), { left: 14, total: 28 });
    assert.equal(prorateTopup({ seatsToAdd: 1, pricePerSeatMdl: 450, periodStart: fs, periodEnd: fe, now: new Date("2027-02-14T10:00:00Z") }), "225.00");
  });
  it("большие числа без потери точности", () =>
    assert.equal(prorateTopup({ ...base, pricePerSeatMdl: 450, seatsToAdd: 1000, now: periodStart }), "450000.00"));
});

describe("canTopup", () => {
  it("активная — можно", () => assert.deepEqual(canTopup(sub(), 2, ctx), { ok: true }));
  it("неверное число мест", () => {
    for (const n of [0, -1, 1.5, NaN, 998]) assert.deepEqual(canTopup(sub(), n, ctx), { ok: false, reason: "INVALID_SEATS" });
  });
  it("отменённая / просрочка / удержание / закончилась", () => {
    assert.deepEqual(canTopup(sub({ cancelAtPeriodEnd: true }), 1, ctx), { ok: false, reason: "CANCELED" });
    assert.deepEqual(canTopup(sub({ status: "PAST_DUE" }), 1, ctx), { ok: false, reason: "PAST_DUE" });
    assert.deepEqual(canTopup(sub({ billingHold: "PRICE_CHANGED" }), 1, ctx), { ok: false, reason: "HOLD" });
    assert.deepEqual(canTopup(sub(), 1, { ...ctx, now: periodEnd }), { ok: false, reason: "ENDED" });
  });
  it("запланировано уменьшение — сначала отменить", () =>
    assert.deepEqual(canTopup(sub({ seats: 5, pendingSeats: 4, pendingFrom: periodEnd }), 1, ctx), {
      ok: false,
      reason: "REDUCTION_SCHEDULED",
    }));
  it("срок списания подошёл или списание идёт", () => {
    assert.deepEqual(canTopup(sub(), 1, { ...ctx, now: nextChargeAt }), { ok: false, reason: "RENEWAL_IN_PROGRESS" });
    assert.deepEqual(canTopup(sub(), 1, { ...ctx, chargeInFlight: true }), { ok: false, reason: "RENEWAL_IN_PROGRESS" });
  });
});

describe("canReduce (со следующего периода)", () => {
  const five = sub({ seats: 5 });
  it("5 → 4 при 1 занятом — можно", () => assert.deepEqual(canReduce(five, 4, 1, ctx), { ok: true }));
  it("не меньше минимума 3", () => assert.deepEqual(canReduce(five, 2, 0, ctx), { ok: false, reason: "BELOW_MIN" }));
  it("не меньше занятых + зарезервированных", () => assert.deepEqual(canReduce(five, 3, 4, ctx), { ok: false, reason: "BELOW_USED" }));
  it("не меньше текущего — отказ", () => {
    assert.deepEqual(canReduce(five, 5, 0, ctx), { ok: false, reason: "NOT_LESS" });
    assert.deepEqual(canReduce(five, 6, 0, ctx), { ok: false, reason: "NOT_LESS" });
  });
  it("уже запланированное можно заменить", () =>
    assert.deepEqual(canReduce(sub({ seats: 6, pendingSeats: 5, pendingFrom: periodEnd }), 4, 0, ctx), { ok: true }));
  it("отменённая / просрочка / удержание / продление", () => {
    assert.deepEqual(canReduce(sub({ seats: 5, cancelAtPeriodEnd: true }), 4, 0, ctx), { ok: false, reason: "CANCELED" });
    assert.deepEqual(canReduce(sub({ seats: 5, status: "PAST_DUE" }), 4, 0, ctx), { ok: false, reason: "PAST_DUE" });
    assert.deepEqual(canReduce(sub({ seats: 5, billingHold: "REVIEW" }), 4, 0, ctx), { ok: false, reason: "HOLD" });
    assert.deepEqual(canReduce(five, 4, 0, { ...ctx, now: nextChargeAt }), { ok: false, reason: "RENEWAL_IN_PROGRESS" });
  });
});

describe("canCancelReduction", () => {
  const scheduled = sub({ seats: 5, pendingSeats: 4, pendingAmount: "1800.00", pendingFrom: periodEnd });
  it("запланировано — можно", () => assert.deepEqual(canCancelReduction(scheduled, ctx), { ok: true }));
  it("нечего отменять", () => assert.deepEqual(canCancelReduction(sub(), ctx), { ok: false, reason: "NOT_SCHEDULED" }));
  it("продление началось — уже нельзя", () => {
    assert.deepEqual(canCancelReduction(scheduled, { ...ctx, now: nextChargeAt }), { ok: false, reason: "RENEWAL_IN_PROGRESS" });
    assert.deepEqual(canCancelReduction(scheduled, { ...ctx, chargeInFlight: true }), { ok: false, reason: "RENEWAL_IN_PROGRESS" });
  });
});

describe("seatsForPeriod / agencyChargeTerms", () => {
  const scheduled = sub({ seats: 5, pendingSeats: 4, pendingAmount: "1800.00", pendingFrom: periodEnd });
  it("период с pendingFrom — меньше мест", () => {
    assert.deepEqual(seatsForPeriod(scheduled, periodEnd), { seats: 4, changed: true });
    assert.deepEqual(seatsForPeriod(scheduled, periodStart), { seats: 5, changed: false });
  });
  it("сумма = места × текущая цена; совпадает с согласием", () =>
    assert.deepEqual(agencyChargeTerms(scheduled, periodEnd, 450, "1800.00"), { seats: 4, amount: "1800.00", changed: true, consentOk: true }));
  it("цена изменилась — согласие не совпадает", () =>
    assert.equal(agencyChargeTerms(sub(), periodEnd, 400, "1350.00").consentOk, false));
  it("нет согласия — не списываем", () => assert.equal(agencyChargeTerms(sub(), periodEnd, 450, null).consentOk, false));
});

describe("toAgencyView", () => {
  const card = { status: "ACTIVE" as const, cardBrand: "visa", cardLast4: "1111", expMonth: 12, expYear: 2030, createdAt: periodStart };
  const full = (over: Partial<AgencySub> = {}) => ({ ...sub(over), graceEndsAt: null, currency: "MDL" });
  const vctx = { ...ctx, lastFailureAt: null };
  it("3 места: докупка есть, уменьшения нет (минимум)", () => {
    const v = toAgencyView(full(), card, 450, 1, vctx)!;
    assert.equal(v.amount, "1350.00");
    assert.equal(v.canTopup, true);
    assert.equal(v.canReduce, false);
    assert.equal(v.minReduceTo, 3);
    assert.equal(v.card?.last4, "1111");
  });
  it("5 мест, 4 занято — уменьшить можно до 4", () => {
    const v = toAgencyView(full({ seats: 5 }), card, 450, 4, vctx)!;
    assert.equal(v.canReduce, true);
    assert.equal(v.minReduceTo, 4);
  });
  it("запланированное уменьшение видно, докупка закрыта", () => {
    const v = toAgencyView(full({ seats: 5, pendingSeats: 4, pendingAmount: "1800.00", pendingFrom: periodEnd }), card, 450, 1, vctx)!;
    assert.deepEqual(v.pendingReduction, { seats: 4, amount: "1800.00", from: periodEnd.toISOString() });
    assert.equal(v.canCancelReduction, true);
    assert.equal(v.canTopup, false);
  });
  it("отменённая — можно возобновить, следующей оплаты нет", () => {
    const v = toAgencyView(full({ cancelAtPeriodEnd: true }), card, 450, 1, vctx)!;
    assert.equal(v.status, "CANCELED");
    assert.equal(v.canResume, true);
    assert.equal(v.nextChargeAt, null);
  });
  it("EXPIRED — нет представления", () => assert.equal(toAgencyView(full({ status: "EXPIRED" }), card, 450, 1, vctx), null));
});
