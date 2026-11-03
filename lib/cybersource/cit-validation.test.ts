// Юнит-тесты проверки завершения первой оплаты (CIT) и разбора деталей транзакции.
// Номеров карт нет: из карты в ответе используются только suffix (4 цифры) и тип.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CIT_FINAL_FAILURES,
  decodeJwtPayload,
  jwtKeyPaths,
  paymentTransactionIds,
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
  it("отказ банка → DECLINED; без приложений оплаты → NOT_READY", () => {
    assert.deepEqual(validateCitCompletion(payment(), facts({ applicationInformation: { applications: [{ name: "ics_auth", rCode: "0" }] } }), "user-1"), { ok: false, code: "DECLINED" });
    assert.deepEqual(validateCitCompletion(payment(), facts({ applicationInformation: { applications: [] } }), "user-1"), { ok: false, code: "NOT_READY" });
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

// ── Сценарии по результатам тестовой оплаты: под одним reference code UC создаёт 3DS-транзакцию
// (ics_pa_setup — без суммы, валюты и токенов) и транзакцию оплаты (ics_auth + ics_bill).
const paSetupOnly = () => ({
  id: "7000000000000000000008",
  submitTimeUTC: "2026-11-03T14:38:27Z",
  applicationInformation: { reasonCode: 100, applications: [{ name: "ics_pa_setup", rCode: "1", rFlag: "SOK" }] },
  clientReferenceInformation: { code: "17621234567891234" },
  paymentInformation: { card: { suffix: "0007" } },
});
const fullPayment = () =>
  details({
    orderInformation: { amountDetails: { totalAmount: "300", currency: "MDL" } },
    applicationInformation: {
      applications: [
        { name: "ics_pay_subscription_create", rCode: "1" },
        { name: "ics_auth", rCode: "1" },
        { name: "ics_bill", rCode: "1" },
        { name: "ics_pa_enroll", rCode: "1" },
      ],
    },
  });

describe("3DS-транзакции и строгие условия FAILED", () => {
  it("транзакция только с ics_pa_setup — не оплата: NOT_READY (пропуск), а не FAILED", () => {
    const f = transactionFactsOf(paSetupOnly())!;
    assert.equal(f.isPayment, false);
    assert.equal(f.amount, null);
    assert.equal(f.currency, null);
    const check = validateCitCompletion(payment(), f, "user-1");
    assert.deepEqual(check, { ok: false, code: "NOT_READY" });
    assert.equal(CIT_FINAL_FAILURES.has("NOT_READY"), false, "NOT_READY не должен вести к FAILED");
  });
  it("только ics_pa_enroll — тоже не оплата", () => {
    const f = transactionFactsOf({ ...paSetupOnly(), applicationInformation: { applications: [{ name: "ics_pa_enroll", rCode: "1" }] } })!;
    assert.equal(f.isPayment, false);
    assert.deepEqual(validateCitCompletion(payment(), f, "user-1"), { ok: false, code: "NOT_READY" });
  });
  it("поиск вернул только 3DS-транзакцию → нет id оплаты (→ UNKNOWN и повтор)", () => {
    assert.deepEqual(paymentTransactionIds([{ id: "T-3DS", applications: [{ name: "ics_pa_setup" }] }]), []);
    assert.deepEqual(
      paymentTransactionIds([
        { id: "T-PAY", applications: [{ name: "ics_pay_subscription_create" }, { name: "ics_auth" }, { name: "ics_bill" }, { name: "ics_pa_enroll" }] },
        { id: "T-3DS", applications: [{ name: "ics_pa_setup" }] },
      ]),
      ["T-PAY"],
    );
  });
  it("отказ ics_auth (rCode 0 или -1) → DECLINED (окончательный FAILED)", () => {
    for (const rCode of ["0", "-1"]) {
      const f = facts({ applicationInformation: { applications: [{ name: "ics_auth", rCode }] } });
      assert.equal(f.outcome, "declined");
      const check = validateCitCompletion(payment(), f, "user-1");
      assert.deepEqual(check, { ok: false, code: "DECLINED" });
      assert.equal(CIT_FINAL_FAILURES.has("DECLINED"), true);
    }
  });
  it("ics_auth без rCode — исход неизвестен: NOT_READY", () => {
    const f = facts({ applicationInformation: { applications: [{ name: "ics_auth" }] } });
    assert.equal(f.outcome, "unknown");
    assert.deepEqual(validateCitCompletion(payment(), f, "user-1"), { ok: false, code: "NOT_READY" });
  });
  it("транзакция оплаты без суммы или валюты → NOT_READY, а не MISMATCH", () => {
    assert.deepEqual(validateCitCompletion(payment(), facts({ orderInformation: { amountDetails: { currency: "MDL" } } }), "user-1"), { ok: false, code: "NOT_READY" });
    assert.deepEqual(validateCitCompletion(payment(), facts({ orderInformation: { amountDetails: { totalAmount: "300.00" } } }), "user-1"), { ok: false, code: "NOT_READY" });
    assert.deepEqual(validateCitCompletion(payment(), facts({ orderInformation: {} }), "user-1"), { ok: false, code: "NOT_READY" });
    assert.deepEqual(validateCitCompletion(payment(), facts({ clientReferenceInformation: {} }), "user-1"), { ok: false, code: "NOT_READY" });
  });
  it("полная оплата (как на тестовой среде: сумма \"300\", 4 приложения) → approved, ok", () => {
    const f = transactionFactsOf(fullPayment())!;
    assert.equal(f.isPayment, true);
    assert.equal(f.outcome, "approved");
    assert.ok(f.customerId && f.paymentInstrumentId && f.networkTransactionId);
    assert.deepEqual(validateCitCompletion(payment(), f, "user-1"), { ok: true });
  });
  it("окончательные отказы — только явные несоответствия и отказ", () => {
    assert.deepEqual([...CIT_FINAL_FAILURES].sort(), ["AMOUNT_MISMATCH", "CURRENCY_MISMATCH", "DECLINED", "REFERENCE_MISMATCH"]);
  });
});

describe("jwtKeyPaths — только имена ключей", () => {
  it("пути без значений, массивы как []", () => {
    const paths = jwtKeyPaths({ iss: "secret-value", content: { paymentInformation: { card: { number: "XXXX" } } }, list: [{ id: "123" }] });
    assert.deepEqual(paths, ["iss", "content.paymentInformation.card.number", "list[]", "list[].id"]);
    assert.equal(paths.join(" ").includes("secret-value"), false);
    assert.equal(paths.join(" ").includes("XXXX"), false);
    assert.deepEqual(jwtKeyPaths(null), []);
  });
});
