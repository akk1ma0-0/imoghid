// Юнит-тесты разбора ответов CyberSource. Тела — по форме примеров из документации. Номеров карт
// нет: маскированное поле TMS — только «X» и 4 цифры, для проверки извлечения last4.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CsResponse } from "@/lib/cybersource/client";
import {
  cardSummaryOf,
  classifyResponse,
  OK_STATUSES,
  reconcileVerdict,
  searchSummariesOf,
} from "@/lib/cybersource/responses";

const res = (httpStatus: number, json: Record<string, unknown> | null): CsResponse => ({
  httpStatus,
  json,
  requestId: typeof json?.id === "string" ? json.id : null,
  correlationId: null,
  ms: 1,
});

describe("classifyResponse — платёж", () => {
  it("201 AUTHORIZED → approved, с requestId и networkTransactionId", () => {
    const o = classifyResponse(
      res(201, {
        id: "6530824710046809304002",
        status: "AUTHORIZED",
        reconciliationId: "79710341A39WTT5W",
        processorInformation: { responseCode: "00", approvalCode: "831000", networkTransactionId: "123456789619999" },
      }),
      OK_STATUSES.payment,
    );
    assert.equal(o.kind, "approved");
    if (o.kind !== "approved") return;
    assert.equal(o.requestId, "6530824710046809304002");
    assert.equal(o.details.networkTransactionId, "123456789619999");
    assert.equal(o.details.processorCode, "00");
    assert.equal(o.details.reconciliationId, "79710341A39WTT5W");
  });

  it("201 DECLINED → declined с причиной и кодом процессора", () => {
    const o = classifyResponse(
      res(201, {
        id: "7000000000000000000001",
        status: "DECLINED",
        errorInformation: { reason: "EXPIRED_CARD", message: "Expired card" },
        processorInformation: { responseCode: "54" },
      }),
      OK_STATUSES.payment,
    );
    assert.equal(o.kind, "declined");
    if (o.kind !== "declined") return;
    assert.equal(o.details.reason, "EXPIRED_CARD");
    assert.equal(o.details.processorCode, "54");
  });

  it("201 AUTHORIZED_RISK_DECLINED → declined", () => {
    assert.equal(classifyResponse(res(201, { id: "1", status: "AUTHORIZED_RISK_DECLINED" }), OK_STATUSES.payment).kind, "declined");
  });

  it("201 PARTIAL_AUTHORIZED / AUTHORIZED_PENDING_REVIEW → review", () => {
    assert.equal(classifyResponse(res(201, { id: "1", status: "PARTIAL_AUTHORIZED" }), OK_STATUSES.payment).kind, "review");
    assert.equal(classifyResponse(res(201, { id: "1", status: "AUTHORIZED_PENDING_REVIEW" }), OK_STATUSES.payment).kind, "review");
  });

  it("400 INVALID_REQUEST → invalid с reason", () => {
    const o = classifyResponse(res(400, { status: "INVALID_REQUEST", reason: "MISSING_FIELD", message: "…" }), OK_STATUSES.payment);
    assert.deepEqual(o, { kind: "invalid", status: "INVALID_REQUEST", reason: "MISSING_FIELD" });
  });

  it("401/403 → auth_error", () => {
    assert.deepEqual(classifyResponse(res(401, { response: { rmsg: "Authentication Failed" } }), OK_STATUSES.payment), { kind: "auth_error", httpStatus: 401 });
    assert.deepEqual(classifyResponse(res(403, null), OK_STATUSES.payment), { kind: "auth_error", httpStatus: 403 });
  });

  it("502 SERVER_ERROR и непонятный 2xx → unknown (сверять, не повторять)", () => {
    assert.deepEqual(classifyResponse(res(502, { status: "SERVER_ERROR", reason: "SYSTEM_ERROR" }), OK_STATUSES.payment), { kind: "unknown", httpStatus: 502, status: "SERVER_ERROR" });
    assert.equal(classifyResponse(res(201, { id: "1", status: "SOMETHING_NEW" }), OK_STATUSES.payment).kind, "unknown");
    assert.equal(classifyResponse(res(200, null), OK_STATUSES.payment).kind, "unknown");
  });
});

describe("classifyResponse — последующие операции", () => {
  it("void VOIDED, refund/capture PENDING, reversal REVERSED → approved", () => {
    assert.equal(classifyResponse(res(201, { id: "v", status: "VOIDED" }), OK_STATUSES.void).kind, "approved");
    assert.equal(classifyResponse(res(201, { id: "r", status: "PENDING" }), OK_STATUSES.refund).kind, "approved");
    assert.equal(classifyResponse(res(201, { id: "c", status: "PENDING" }), OK_STATUSES.capture).kind, "approved");
    assert.equal(classifyResponse(res(201, { id: "x", status: "REVERSED" }), OK_STATUSES.reversal).kind, "approved");
  });
  it("статус успеха чужой операции не считается успехом", () => {
    assert.equal(classifyResponse(res(201, { id: "v", status: "PENDING" }), OK_STATUSES.void).kind, "unknown");
  });
  it("404 → not_found", () => {
    assert.deepEqual(classifyResponse(res(404, null), OK_STATUSES.refund), { kind: "not_found" });
  });
});

describe("cardSummaryOf (TMS payment instrument)", () => {
  it("только last4, бренд, срок и состояние", () => {
    const c = cardSummaryOf({
      id: "F39732BE4BDA9A1EE053AF598E0A4081",
      state: "ACTIVE",
      card: { expirationMonth: "12", expirationYear: "2031", type: "001" },
      _embedded: { instrumentIdentifier: { card: { number: "XXXXXXXXXXXX0007" } } },
    });
    assert.deepEqual(c, { last4: "0007", brand: "Visa", expMonth: 12, expYear: 2031, state: "ACTIVE" });
  });
  it("Mastercard и отсутствующие поля", () => {
    assert.deepEqual(cardSummaryOf({ card: { type: "002" } }), { last4: null, brand: "Mastercard", expMonth: null, expYear: null, state: null });
    assert.deepEqual(cardSummaryOf(null), { last4: null, brand: null, expMonth: null, expYear: null, state: null });
  });
});

describe("поиск транзакций и вердикт сверки", () => {
  const json = {
    searchId: "s1",
    count: 2,
    totalCount: 2,
    _embedded: {
      transactionSummaries: [
        { id: "T2", submitTimeUtc: "2026-11-02T10:00:01Z", applicationInformation: { applications: [{ name: "ics_bill", rCode: "1", rFlag: "SOK" }, { name: "ics_auth", rCode: "1", rFlag: "SOK", reasonCode: "100" }] } },
        { id: "T1", submitTimeUtc: "2026-11-02T09:59:00Z", applicationInformation: { applications: [{ name: "ics_auth", rCode: "0", rFlag: "DCARDEXPIRED", reasonCode: 202 }] } },
      ],
    },
  };
  it("разбирает transactionSummaries (числовые коды → строки)", () => {
    const s = searchSummariesOf(json);
    assert.equal(s.length, 2);
    assert.equal(s[0].id, "T2");
    assert.equal(s[1].applications[0].reasonCode, "202");
  });
  it("успешная авторизация среди найденных → approved", () => {
    assert.deepEqual(reconcileVerdict(searchSummariesOf(json)), { verdict: "approved", transactionId: "T2" });
  });
  it("только отказ → declined; пусто → not_found; без ics_auth → unknown", () => {
    assert.deepEqual(reconcileVerdict(searchSummariesOf({ _embedded: { transactionSummaries: [json._embedded.transactionSummaries[1]] } })), { verdict: "declined", transactionId: "T1" });
    assert.deepEqual(reconcileVerdict(searchSummariesOf({ count: 0 })), { verdict: "not_found", transactionId: null });
    assert.deepEqual(reconcileVerdict([{ id: "X", submitTimeUtc: null, applications: [] }]), { verdict: "unknown", transactionId: "X" });
  });
});
