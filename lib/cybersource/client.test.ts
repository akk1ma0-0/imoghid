// Юнит-тесты подписи CyberSource HTTP Signature. Эталонные digest/подписи посчитаны независимо
// утилитой openssl (`openssl dgst -sha256 [-mac HMAC -macopt hexkey:…] -binary | base64`) для
// фиктивных входных данных; секрет ниже — тестовый, не настоящий ключ.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { acceptFor, buildAuthHeaders, digestOf, safePathId } from "@/lib/cybersource/client";

const FAKE_SECRET = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="; // base64("0123456789abcdef0123456789abcdef")
const DATE = "Thu, 18 Jul 2019 00:18:03 GMT";
const HOST = "apitest.cybersource.com";
const BODY =
  '{"clientReferenceInformation":{"code":"TEST-1"},"orderInformation":{"amountDetails":{"totalAmount":"300.00","currency":"MDL"}}}';

describe("digestOf", () => {
  it("SHA-256 тела в base64 с префиксом", () => {
    assert.equal(digestOf(BODY), "SHA-256=Gd0GUu0jkb2WYsK4BIPDA/X9s1bI6z/IHJZu1TlUJtU=");
  });
  it("пустое тело — известный SHA-256 пустой строки", () => {
    assert.equal(digestOf(""), "SHA-256=47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
  });
});

describe("buildAuthHeaders", () => {
  it("POST: digest и подпись по host/date/request-target/digest/v-c-merchant-id", () => {
    const h = buildAuthHeaders({
      method: "POST",
      host: HOST,
      path: "/pts/v2/payments",
      body: BODY,
      merchantId: "test_merchant",
      keyId: "00000000-0000-0000-0000-000000000000",
      sharedSecret: FAKE_SECRET,
      date: DATE,
    });
    assert.equal(h.host, HOST);
    assert.equal(h.date, DATE);
    assert.equal(h["v-c-merchant-id"], "test_merchant");
    assert.equal(h.digest, "SHA-256=Gd0GUu0jkb2WYsK4BIPDA/X9s1bI6z/IHJZu1TlUJtU=");
    assert.equal(
      h.signature,
      'keyid="00000000-0000-0000-0000-000000000000", algorithm="HmacSHA256", ' +
        'headers="host date request-target digest v-c-merchant-id", ' +
        'signature="0MLTkHtrXtEQn+Nuq8Ai8BAsNr65D7LyD5WaAJNCjpE="',
    );
  });

  it("GET: без digest, тело игнорируется", () => {
    const h = buildAuthHeaders({
      method: "GET",
      host: HOST,
      path: "/tms/v2/customers/ABC123",
      body: "ignored",
      merchantId: "test_merchant",
      keyId: "k1",
      sharedSecret: FAKE_SECRET,
      date: DATE,
    });
    assert.equal(h.digest, undefined);
    assert.equal(
      h.signature,
      'keyid="k1", algorithm="HmacSHA256", headers="host date request-target v-c-merchant-id", ' +
        'signature="x6ZV3sj8D0FssOhHBT02IEBGlpiPOeWFqGEVANyBeCA="',
    );
  });

  it("DELETE: тоже без digest", () => {
    const h = buildAuthHeaders({
      method: "DELETE",
      host: HOST,
      path: "/tms/v2/customers/ABC123",
      body: "",
      merchantId: "m",
      keyId: "k",
      sharedSecret: FAKE_SECRET,
      date: DATE,
    });
    assert.equal(h.digest, undefined);
    assert.match(h.signature, /headers="host date request-target v-c-merchant-id"/);
  });

  it("подпись зависит от тела, пути и merchant id", () => {
    const base = { method: "POST" as const, host: HOST, path: "/pts/v2/payments", body: BODY, merchantId: "m", keyId: "k", sharedSecret: FAKE_SECRET, date: DATE };
    const s0 = buildAuthHeaders(base).signature;
    assert.notEqual(buildAuthHeaders({ ...base, body: BODY + " " }).signature, s0);
    assert.notEqual(buildAuthHeaders({ ...base, path: "/pts/v2/payments/" }).signature, s0);
    assert.notEqual(buildAuthHeaders({ ...base, merchantId: "m2" }).signature, s0);
  });
});

describe("safePathId", () => {
  it("пропускает id транзакций/токенов", () => {
    assert.equal(safePathId("7012345678901234567890"), "7012345678901234567890");
    assert.equal(safePathId("F39732BE4BDA9A1EE053AF598E0A4081"), "F39732BE4BDA9A1EE053AF598E0A4081");
  });
  it("отклоняет попытки изменить путь", () => {
    assert.throws(() => safePathId("../tms/v2/customers"));
    assert.throws(() => safePathId("abc/def"));
    assert.throws(() => safePathId("a?b=c"));
    assert.throws(() => safePathId(""));
  });
});

describe("acceptFor", () => {
  it("pts и tss/transactions — hal+json, tss/searches и tms — json, uc — jwt", () => {
    assert.equal(acceptFor("/pts/v2/payments"), "application/hal+json;charset=utf-8");
    assert.equal(acceptFor("/tss/v2/searches"), "application/json;charset=utf-8");
    assert.equal(acceptFor("/tss/v2/transactions/123"), "application/hal+json;charset=utf-8");
    assert.equal(acceptFor("/uc/v1/sessions"), "application/jwt");
    assert.equal(acceptFor("/tms/v2/customers/ABC"), "application/json;charset=utf-8");
  });
});
