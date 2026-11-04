import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addMonthsAnchored,
  attemptDueAt,
  chargeDueFor,
  decideSubscriptionAction,
  graceEndsFor,
  MAX_ATTEMPTS,
  nextPeriodEnd,
  type SubscriptionView,
} from "@/lib/billing-period";

const d = (iso: string) => new Date(iso);
const iso = (x: Date | null) => (x ? x.toISOString() : null);

describe("календарный период от якоря", () => {
  it("+1 месяц сохраняет число и время", () => {
    assert.equal(iso(addMonthsAnchored(d("2026-11-03T14:54:47.583Z"), 1)), "2026-12-03T14:54:47.583Z");
  });
  it("переход через год", () => {
    assert.equal(iso(addMonthsAnchored(d("2026-12-15T10:00:00Z"), 1)), "2027-01-15T10:00:00.000Z");
    assert.equal(iso(addMonthsAnchored(d("2026-11-30T00:00:00Z"), 14)), "2028-01-30T00:00:00.000Z");
  });
  it("31-е: короткий месяц — последний день, якорь не съезжает (31 → 28 → 31 → 30 → 31)", () => {
    const anchor = d("2027-01-31T09:00:00Z");
    let end = addMonthsAnchored(anchor, 1);
    assert.equal(iso(end), "2027-02-28T09:00:00.000Z");
    end = nextPeriodEnd(anchor, end);
    assert.equal(iso(end), "2027-03-31T09:00:00.000Z");
    end = nextPeriodEnd(anchor, end);
    assert.equal(iso(end), "2027-04-30T09:00:00.000Z");
    end = nextPeriodEnd(anchor, end);
    assert.equal(iso(end), "2027-05-31T09:00:00.000Z");
  });
  it("високосный год: 31 янв 2028 → 29 фев 2028 → 31 мар", () => {
    const anchor = d("2028-01-31T12:00:00Z");
    const feb = addMonthsAnchored(anchor, 1);
    assert.equal(iso(feb), "2028-02-29T12:00:00.000Z");
    assert.equal(iso(nextPeriodEnd(anchor, feb)), "2028-03-31T12:00:00.000Z");
    // 29 фев как якорь: в невисокосный год — 28-е, затем снова 29-е в високосный
    const leap = d("2028-02-29T00:00:00Z");
    assert.equal(iso(addMonthsAnchored(leap, 12)), "2029-02-28T00:00:00.000Z");
    assert.equal(iso(addMonthsAnchored(leap, 48)), "2032-02-29T00:00:00.000Z");
  });
  it("старая 30-дневная подписка: ближайшая якорная дата после текущего конца, без сдвига", () => {
    const anchor = d("2027-01-31T09:00:00Z");
    // 30 дней от 31 янв = 2 марта; следующий конец — якорный 31 марта (не 30/2 апреля)
    assert.equal(iso(nextPeriodEnd(anchor, d("2027-03-02T09:00:00Z"))), "2027-03-31T09:00:00.000Z");
    // конец ровно на якоре → строго следующий месяц
    assert.equal(iso(nextPeriodEnd(d("2026-11-03T15:10:02Z"), d("2026-12-03T15:10:02Z"))), "2027-01-03T15:10:02.000Z");
  });
});

describe("расписание списаний и повторов", () => {
  const end = d("2026-12-03T15:00:00Z");
  it("списание — за сутки до конца периода", () => {
    assert.equal(iso(chargeDueFor(end)), "2026-12-02T15:00:00.000Z");
  });
  it("попытки: срок, +1, +3, +5 дней; дальше — нет", () => {
    assert.equal(MAX_ATTEMPTS, 4);
    assert.equal(iso(attemptDueAt(end, 1)), "2026-12-02T15:00:00.000Z");
    assert.equal(iso(attemptDueAt(end, 2)), "2026-12-03T15:00:00.000Z");
    assert.equal(iso(attemptDueAt(end, 3)), "2026-12-05T15:00:00.000Z");
    assert.equal(iso(attemptDueAt(end, 4)), "2026-12-07T15:00:00.000Z");
    assert.equal(attemptDueAt(end, 5), null);
    assert.equal(attemptDueAt(end, 0), null);
  });
  it("грейс — 5 дней после конца периода и позже последней попытки", () => {
    const grace = graceEndsFor(end);
    assert.equal(iso(grace), "2026-12-08T15:00:00.000Z");
    assert.ok(grace.getTime() > attemptDueAt(end, MAX_ATTEMPTS)!.getTime());
  });
});

describe("выбор действия по подписке", () => {
  const end = d("2026-12-03T15:00:00Z");
  const base: SubscriptionView = {
    kind: "PERSONAL",
    status: "ACTIVE",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: end,
    nextChargeAt: chargeDueFor(end),
    graceEndsAt: null,
    billingHold: null,
    reminderSentFor: null,
  };
  const at = (s: string) => d(s);
  it("рано — ничего; за 3 дня — письмо; повторно за период — нет", () => {
    assert.equal(decideSubscriptionAction(base, at("2026-11-20T00:00:00Z")), "none");
    assert.equal(decideSubscriptionAction(base, at("2026-11-29T16:00:00Z")), "remind");
    assert.equal(decideSubscriptionAction({ ...base, reminderSentFor: end }, at("2026-11-29T16:00:00Z")), "none");
  });
  it("в срок списания — charge (и для PAST_DUE с запланированным повтором)", () => {
    assert.equal(decideSubscriptionAction(base, at("2026-12-02T15:00:00Z")), "charge");
    assert.equal(decideSubscriptionAction({ ...base, status: "PAST_DUE", nextChargeAt: at("2026-12-05T15:00:00Z") }, at("2026-12-05T16:00:00Z")), "charge");
  });
  it("агентская подписка — те же решения, что у личной (письмо, списание, удержание, окончание)", () => {
    const ag = { ...base, kind: "AGENCY" as const };
    assert.equal(decideSubscriptionAction(ag, at("2026-11-29T16:00:00Z")), "remind");
    assert.equal(decideSubscriptionAction(ag, at("2026-12-02T16:00:00Z")), "charge");
    assert.equal(decideSubscriptionAction({ ...ag, billingHold: "PRICE_CHANGED" }, at("2026-12-02T16:00:00Z")), "hold");
    assert.equal(decideSubscriptionAction({ ...ag, cancelAtPeriodEnd: true }, at("2026-12-03T15:00:00Z")), "expire_canceled");
    assert.equal(decideSubscriptionAction({ ...ag, status: "CANCELED", cancelAtPeriodEnd: true }, at("2026-12-03T16:00:00Z")), "expire_canceled");
    assert.equal(
      decideSubscriptionAction({ ...ag, status: "PAST_DUE", nextChargeAt: null, graceEndsAt: at("2026-12-08T15:00:00Z") }, at("2026-12-08T15:00:00Z")),
      "expire_grace",
    );
  });
  it("удержание админом — не списываем", () => {
    assert.equal(decideSubscriptionAction({ ...base, billingHold: "PRICE_CHANGED" }, at("2026-12-02T16:00:00Z")), "hold");
  });
  it("отмена: до конца периода — ничего (ни письма, ни списания), после — expire_canceled", () => {
    const c = { ...base, cancelAtPeriodEnd: true };
    assert.equal(decideSubscriptionAction(c, at("2026-12-02T16:00:00Z")), "none");
    assert.equal(decideSubscriptionAction(c, at("2026-12-03T15:00:00Z")), "expire_canceled");
    assert.equal(decideSubscriptionAction({ ...c, status: "CANCELED" }, at("2026-12-03T16:00:00Z")), "expire_canceled");
    assert.equal(decideSubscriptionAction({ ...base, status: "CANCELED" }, at("2026-12-03T16:00:00Z")), "none");
  });
  it("жёсткий отказ: PAST_DUE без повторов — ждём конца грейса, затем expire_grace", () => {
    const h = { ...base, status: "PAST_DUE" as const, nextChargeAt: null, graceEndsAt: graceEndsFor(end) };
    assert.equal(decideSubscriptionAction(h, at("2026-12-05T00:00:00Z")), "none");
    assert.equal(decideSubscriptionAction(h, at("2026-12-08T15:00:00Z")), "expire_grace");
  });
  it("EXPIRED — ничего", () => {
    assert.equal(decideSubscriptionAction({ ...base, status: "EXPIRED" }, at("2026-12-10T00:00:00Z")), "none");
  });
});
