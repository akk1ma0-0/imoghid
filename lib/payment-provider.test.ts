import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { csBetaEmails, isCyberSourceEnabledFor, paymentProvider } from "@/lib/payment-provider";

const saved = { p: process.env.PAYMENT_PROVIDER, b: process.env.CS_BETA_EMAILS };
const restore = (k: string, v: string | undefined) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
afterEach(() => {
  restore("PAYMENT_PROVIDER", saved.p);
  restore("CS_BETA_EMAILS", saved.b);
});

describe("переключатель провайдера", () => {
  it("по умолчанию victoriabank — CyberSource никому, даже ADMIN", () => {
    delete process.env.PAYMENT_PROVIDER;
    process.env.CS_BETA_EMAILS = "a@x.md";
    assert.equal(paymentProvider(), "victoriabank");
    assert.equal(isCyberSourceEnabledFor({ email: "a@x.md", role: "AGENT" }), false);
    assert.equal(isCyberSourceEnabledFor({ email: "admin@x.md", role: "ADMIN" }), false);
  });
  it("cybersource — только бета-список (регистр/пробелы не важны) и ADMIN", () => {
    process.env.PAYMENT_PROVIDER = " CyberSource ";
    process.env.CS_BETA_EMAILS = " A@x.md , b@y.md,,";
    assert.deepEqual(csBetaEmails(), ["a@x.md", "b@y.md"]);
    assert.equal(isCyberSourceEnabledFor({ email: "a@X.md", role: "AGENT" }), true);
    assert.equal(isCyberSourceEnabledFor({ email: "c@z.md", role: "AGENT" }), false);
    assert.equal(isCyberSourceEnabledFor({ email: "c@z.md", role: "ADMIN" }), true);
  });
  it("неизвестное значение → victoriabank", () => {
    process.env.PAYMENT_PROVIDER = "stripe";
    assert.equal(paymentProvider(), "victoriabank");
  });
});
