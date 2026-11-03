// Юнит-тесты проверки завершения первой оплаты (CIT) и разбора деталей транзакции.
// Номеров карт нет: из карты в ответе используются только suffix (4 цифры) и тип.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decodeJwtPayload,
  transactionFactsOf,
  transactionIdCandidates,
  validateCitCompletion,
  type CitPaymentView,
  type TxnFacts,
} from "@/lib/cybersource/cit-validation";

const jwtOf = (payload: unknown) =>
  ["eyJhbGciOiJSUzI1NiJ9", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");

// Детали транзакции по форме TssV2TransactionsGet200Response.
const details = (over: Record<string, unknown> = {}) => ({
  id: "7012345678901234567890",
  clientReferenceInformation: { code: "17621234567891234" },
  orderInformation: { amountDetails: { totalAmount: "300.00", currency: "MDL" } },
  applicationInformation: { applications: [{ name: "ics_auth", rCode: "1" }, { name: "ics_bill", rCode: "1" }] },
  paymentInformation: {
    customer: { id: "CUST0000000000000000000000000001" },
    paymentInstrument: { id: "PI00000000000000000000000000001" },
    card: { prefix: "999999", suffix: "0007", type: "001", expirationMonth: "12", expirationYear: "2031" },
  },
  processorInformation: { networkTransactionId: "123456789619999", approvalCode: "831000", responseCode: "00" },
  ...over,
});

const payment = (over: Partial<CitPaymentView> = {}): CitPaymentView => ({
  userId: "user-1",
  order: "17621234567891234",
  amount: "300.00",
  currency: "MDL",
  provider: "CYBERSOURCE",
  initiator: "CUSTOMER",
  status: "PENDING",
  ...over,
});

const facts = (over: Record<string, unknown> = {}): TxnFacts => transactionFactsOf(details(over))!;

describe("transactionFactsOf", () => {
  it("берёт сумму, ссылку, токены, NTI и только last4/бренд/срок карты (без BIN)", () => {
    const f = facts();
    assert.equal(f.id, "7012345678901234567890");
    assert.equal(f.referenceCode, "17621234567891234");
    assert.equal(f.amount, "300.00");
    assert.equal(f.currency, "MDL");
    assert.equal(f.outcome, "approved");
    assert.equal(f.customerId, "CUST0000000000000000000000000001");
    assert.equal(f.paymentInstrumentId, "PI00000000000000000000000000001");
    assert.equal(f.networkTransactionId, "123456789619999");
    assert.equal(f.cardLast4, "0007");
    assert.equal(f.cardBrand, "Visa");
    assert.equal(f.expMonth, 12);
    assert.equal(f.expYear, 2031);
    assert.equal(JSON.stringify(f).includes("999999"), false, "BIN не должен попадать в факты");
  });
  it("отказ авторизации → declined; без ics_auth → unknown; без id → null", () => {
    assert.equal(facts({ applicationInformation: { applications: [{ name: "ics_auth", rCode: "0" }] } }).outcome, "declined");
    assert.equal(facts({ applicationInformation: { applications: [] } }).outcome, "unknown");
    assert.equal(transactionFactsOf({ status: "x" }), null);
  });
  it("токены из tokenInformation, если в paymentInformation их нет", () => {
    const f = facts({
      paymentInformation: { card: { suffix: "0007" } },
      tokenInformation: { customer: { id: "C2" }, paymentInstrument: { id: "P2" } },
    });
    assert.equal(f.customerId, "C2");
    assert.equal(f.paymentInstrumentId, "P2");
  });
});

describe("validateCitCompletion", () => {
  it("всё совпадает → ok", () => {
    assert.deepEqual(validateCitCompletion(payment(), facts(), "user-1"), { ok: true });
    // 300 и "300.00" — одна сумма
    assert.deepEqual(validateCitCompletion(payment(), facts({ orderInformation: { amountDetails: { totalAmount: "300", currency: "mdl" } } }), "user-1"), { ok: true });
  });
  it("чужой платёж → NOT_OWNER", () => {
    assert.deepEqual(validateCitCompletion(payment(), facts(), "user-2"), { ok: false, code: "NOT_OWNER" });
    assert.deepEqual(validateCitCompletion(payment({ userId: null }), facts(), "user-1"), { ok: false, code: "NOT_OWNER" });
  });
  it("повтор уже оплаченного → ALREADY_PAID", () => {
    assert.deepEqual(validateCitCompletion(payment({ status: "PAID" }), facts(), "user-1"), { ok: false, code: "ALREADY_PAID" });
  });
  it("не наш провайдер/инициатор → WRONG_PROVIDER", () => {
    assert.deepEqual(validateCitCompletion(payment({ provider: "VICTORIABANK" }), facts(), "user-1"), { ok: false, code: "WRONG_PROVIDER" });
    assert.deepEqual(validateCitCompletion(payment({ initiator: "MERCHANT" }), facts(), "user-1"), { ok: false, code: "WRONG_PROVIDER" });
  });
  it("другая сумма/валюта/ссылка → отказ проверки", () => {
    assert.deepEqual(validateCitCompletion(payment(), facts({ orderInformation: { amountDetails: { totalAmount: "30.00", currency: "MDL" } } }), "user-1"), { ok: false, code: "AMOUNT_MISMATCH" });
    assert.deepEqual(validateCitCompletion(payment(), facts({ orderInformation: { amountDetails: { totalAmount: "300.01", currency: "MDL" } } }), "user-1"), { ok: false, code: "AMOUNT_MISMATCH" });
    assert.deepEqual(validateCitCompletion(payment(), facts({ orderInformation: { amountDetails: { totalAmount: "300.00", currency: "EUR" } } }), "user-1"), { ok: false, code: "CURRENCY_MISMATCH" });
    assert.deepEqual(validateCitCompletion(payment(), facts({ clientReferenceInformation: { code: "other" } }), "user-1"), { ok: false, code: "REFERENCE_MISMATCH" });
  });
  it("отказ банка → DECLINED; статус не финальный → NOT_APPROVED", () => {
    assert.deepEqual(validateCitCompletion(payment(), facts({ applicationInformation: { applications: [{ name: "ics_auth", rCode: "0" }] } }), "user-1"), { ok: false, code: "DECLINED" });
    assert.deepEqual(validateCitCompletion(payment(), facts({ applicationInformation: { applications: [] } }), "user-1"), { ok: false, code: "NOT_APPROVED" });
  });
});

describe("JWT результата из браузера — только подсказка", () => {
  it("кандидаты id транзакции из любых вложенных id/transactionId", () => {
    const p = decodeJwtPayload(jwtOf({ id: "nope", content: { details: { id: "7012345678901234567890" } }, transactionId: "7099999999999999999999" }));
    assert.deepEqual(transactionIdCandidates(p).sort(), ["7012345678901234567890", "7099999999999999999999"]);
  });
  it("мусор и не-JWT → пусто", () => {
    assert.equal(decodeJwtPayload("not-a-jwt"), null);
    assert.equal(decodeJwtPayload(123), null);
    assert.deepEqual(transactionIdCandidates(null), []);
    assert.deepEqual(transactionIdCandidates(decodeJwtPayload(jwtOf({ id: "abc" }))), []);
  });
});
