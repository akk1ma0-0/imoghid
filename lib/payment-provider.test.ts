import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { csBetaEmails, csBetaOnly, isCyberSourceEnabledFor, paymentProvider } from "@/lib/payment-provider";

const KEYS = ["PAYMENT_PROVIDER", "CS_BETA_EMAILS", "CS_BETA_ONLY"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
});

const env = (provider: string | undefined, betaOnly: string | undefined, emails = "a@x.md") => {
  for (const [k, v] of [["PAYMENT_PROVIDER", provider], ["CS_BETA_ONLY", betaOnly], ["CS_BETA_EMAILS", emails]] as const) {
    v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
};
const admin = { email: "admin@x.md", role: "ADMIN" as const };
const beta = { email: "a@X.md", role: "AGENT" as const };
const plain = { email: "c@z.md", role: "AGENT" as const };

describe("переключатель провайдера: матрица", () => {
  it("PAYMENT_PROVIDER не задан / другой → VictoriaBank всем (даже ADMIN и бета), при любом CS_BETA_ONLY", () => {
    for (const p of [undefined, "", "victoriabank", "stripe"]) {
      for (const b of [undefined, "true", "false"]) {
        env(p, b);
        assert.equal(paymentProvider(), "victoriabank");
        for (const u of [admin, beta, plain]) assert.equal(isCyberSourceEnabledFor(u), false, `${p}/${b}/${u.email}`);
      }
    }
  });
  it("cybersource, CS_BETA_ONLY выключен (не задан / false / мусор) → CyberSource всем", () => {
    for (const b of [undefined, "", "false", "0", "yes"]) {
      env(" CyberSource ", b);
      assert.equal(csBetaOnly(), false);
      for (const u of [admin, beta, plain]) assert.equal(isCyberSourceEnabledFor(u), true, `${b}/${u.email}`);
    }
  });
  it("cybersource + CS_BETA_ONLY=true → только ADMIN и бета-список (регистр/пробелы не важны)", () => {
    env("cybersource", " TRUE ", " A@x.md , b@y.md,,");
    assert.equal(csBetaOnly(), true);
    assert.deepEqual(csBetaEmails(), ["a@x.md", "b@y.md"]);
    assert.equal(isCyberSourceEnabledFor(admin), true);
    assert.equal(isCyberSourceEnabledFor(beta), true);
    assert.equal(isCyberSourceEnabledFor(plain), false);
  });
  it("CS_BETA_ONLY=true с пустым списком → только ADMIN", () => {
    env("cybersource", "true", "");
    assert.equal(isCyberSourceEnabledFor(admin), true);
    assert.equal(isCyberSourceEnabledFor(beta), false);
    assert.equal(isCyberSourceEnabledFor(plain), false);
  });
});
