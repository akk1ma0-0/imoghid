import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canCancel,
  canChangeCard,
  canPayNow,
  canResume,
  cardChangedSince,
  clientStatus,
  cooldownLeftMs,
  toClientView,
  type CardForRules,
  type SubForRules,
} from "@/lib/subscription-rules";

const end = new Date("2027-01-03T15:10:02Z");
const now = new Date("2026-12-10T10:00:00Z");
const sub = (over: Partial<SubForRules> = {}): SubForRules => ({
  status: "ACTIVE",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: end,
  nextChargeAt: new Date("2027-01-02T15:10:02Z"),
  graceEndsAt: null,
  billingHold: null,
  plan: "BASIC",
  amount: "300.00",
  currency: "MDL",
  ...over,
});
const card = (over: Partial<NonNullable<CardForRules>> = {}): CardForRules => ({
  status: "ACTIVE",
  cardBrand: "Visa",
  cardLast4: "0007",
  expMonth: 12,
  expYear: 2031,
  createdAt: new Date("2026-11-03T15:10:00Z"),
  ...over,
});

describe("статус для клиента", () => {
  it("ACTIVE / PAST_DUE / CANCELED по флагу; EXPIRED — не показываем", () => {
    assert.equal(clientStatus(sub()), "ACTIVE");
    assert.equal(clientStatus(sub({ status: "PAST_DUE" })), "PAST_DUE");
    assert.equal(clientStatus(sub({ cancelAtPeriodEnd: true })), "CANCELED");
    assert.equal(clientStatus(sub({ status: "CANCELED", cancelAtPeriodEnd: true })), "CANCELED");
    assert.equal(clientStatus(sub({ status: "EXPIRED" })), null);
  });
});

describe("отмена и возобновление", () => {
  it("отменить можно один раз (повтор — уже отменена)", () => {
    assert.equal(canCancel(sub()), true);
    assert.equal(canCancel(sub({ status: "PAST_DUE" })), true);
    assert.equal(canCancel(sub({ cancelAtPeriodEnd: true })), false);
    assert.equal(canCancel(sub({ status: "EXPIRED" })), false);
  });
  it("возобновить — только отменённую, до конца периода, с активной картой", () => {
    assert.deepEqual(canResume(sub({ cancelAtPeriodEnd: true }), card(), now), { ok: true });
    assert.deepEqual(canResume(sub(), card(), now), { ok: false, reason: "NOT_CANCELED" });
  });
  it("после EXPIRED или конца периода — нельзя (ENDED)", () => {
    assert.deepEqual(canResume(sub({ status: "EXPIRED", cancelAtPeriodEnd: true }), card(), now), { ok: false, reason: "ENDED" });
    assert.deepEqual(canResume(sub({ cancelAtPeriodEnd: true }), card(), new Date("2027-01-03T15:10:02Z")), { ok: false, reason: "ENDED" });
  });
  it("без карты (токен удалён) — нельзя (NO_CARD)", () => {
    assert.deepEqual(canResume(sub({ cancelAtPeriodEnd: true }), card({ status: "REMOVED" }), now), { ok: false, reason: "NO_CARD" });
    assert.deepEqual(canResume(sub({ cancelAtPeriodEnd: true }), null, now), { ok: false, reason: "NO_CARD" });
  });
  it("смена карты — пока подписка не закончилась", () => {
    assert.equal(canChangeCard(sub({ status: "PAST_DUE" })), true);
    assert.equal(canChangeCard(sub({ cancelAtPeriodEnd: true })), true);
    assert.equal(canChangeCard(sub({ status: "EXPIRED" })), false);
  });
});

describe("Plătește acum", () => {
  it("только PAST_DUE, не отменена, активная карта, без удержания", () => {
    assert.deepEqual(canPayNow(sub({ status: "PAST_DUE" }), card()), { ok: true });
    assert.deepEqual(canPayNow(sub(), card()), { ok: false, reason: "NOT_PAST_DUE" });
    assert.deepEqual(canPayNow(sub({ status: "PAST_DUE", cancelAtPeriodEnd: true }), card()), { ok: false, reason: "CANCELED" });
    assert.deepEqual(canPayNow(sub({ status: "PAST_DUE" }), card({ status: "REMOVED" })), { ok: false, reason: "NO_CARD" });
    assert.deepEqual(canPayNow(sub({ status: "PAST_DUE", billingHold: "PRICE_CHANGED" }), card()), { ok: false, reason: "HOLD" });
  });
  it("кнопка — после смены карты (карта новее последней неудачи)", () => {
    const failure = new Date("2027-01-02T15:10:02Z");
    assert.equal(cardChangedSince(card({ createdAt: new Date("2027-01-03T09:00:00Z") }), failure), true);
    assert.equal(cardChangedSince(card({ createdAt: new Date("2026-11-03T15:10:00Z") }), failure), false);
    assert.equal(cardChangedSince(card(), null), false);
  });
});

describe("представление для клиента — без внутренних данных", () => {
  it("нет billingHold, токенов; карта — бренд/last4/срок; отменённая — без следующей даты", () => {
    const v = toClientView(sub({ billingHold: "PRICE_CHANGED", cancelAtPeriodEnd: true }), card(), now, null)!;
    const json = JSON.stringify(v);
    assert.equal(json.includes("billingHold"), false);
    assert.equal(json.includes("PRICE_CHANGED"), false);
    assert.equal(json.includes("tms"), false);
    assert.deepEqual(v.card, { brand: "Visa", last4: "0007", expMonth: 12, expYear: 2031 });
    assert.equal(v.status, "CANCELED");
    assert.equal(v.nextChargeAt, null);
    assert.equal(v.canResume, true);
    assert.equal(v.canCancel, false);
  });
  it("PAST_DUE: доступ до конца грейса; удалённая карта не показывается", () => {
    const grace = new Date("2027-01-08T15:10:02Z");
    const v = toClientView(sub({ status: "PAST_DUE", graceEndsAt: grace, nextChargeAt: null }), card({ status: "REMOVED" }), now, null)!;
    assert.equal(v.accessUntil, grace.toISOString());
    assert.equal(v.card, null);
    assert.equal(v.canPayNow, false);
  });
  it("EXPIRED → null", () => {
    assert.equal(toClientView(sub({ status: "EXPIRED" }), card(), now, null), null);
  });
});

describe("кулдаун", () => {
  it("оставшееся время до повторного действия", () => {
    assert.equal(cooldownLeftMs(null, 5000, now), 0);
    assert.equal(cooldownLeftMs(new Date(now.getTime() - 2000), 5000, now), 3000);
    assert.equal(cooldownLeftMs(new Date(now.getTime() - 9000), 5000, now), 0);
  });
});
