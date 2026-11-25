import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { paymentDescription } from "@/lib/payment-description";
import { payerSnapshot } from "@/lib/payer-snapshot";

describe("paymentDescription", () => {
  it("подписка / HUB / доплата / одноразовый доступ / проверка карты", () => {
    assert.equal(paymentDescription({ plan: "BASIC" }), "Abonament ImoGhid — Plan Basic");
    assert.equal(paymentDescription({ plan: "PRO", purpose: "SUBSCRIPTION" }), "Abonament ImoGhid — Plan Pro");
    assert.equal(paymentDescription({ plan: "HUB", purpose: "AGENCY_SEATS", seats: 3 }), "HUB/Agenție — 3 locuri");
    assert.equal(paymentDescription({ plan: "HUB", purpose: "AGENCY_TOPUP", seats: 1 }), "HUB/Agenție — 1 loc adăugat (perioada rămasă)");
    assert.equal(paymentDescription({ plan: "HUB", purpose: "AGENCY_TOPUP", seats: 2 }), "HUB/Agenție — 2 locuri adăugate (perioada rămasă)");
    assert.match(paymentDescription({ plan: "BASIC", purpose: "SINGLE_ACCESS" }), /^O accesare/);
    assert.equal(
      paymentDescription({ plan: "PRO", purpose: "OVERAGE", overageFeature: "CADASTRU_CHECK" }),
      "Supra-limit — verificarea cadastrală (Plan Pro)",
    );
    assert.match(paymentDescription({ plan: "BASIC", cardVerification: true }), /Verificare card \(0\.00\)/);
  });
});

describe("payerSnapshot", () => {
  const user = { name: "  Ion Popescu ", phone: "+373 69 000 000" };
  const req = (h: Record<string, string>) => new Request("https://imoghid.md/x", { headers: h });

  it("имя/телефон обрезаются по краям, IP из x-forwarded-for (первый адрес)", () => {
    const s = payerSnapshot({ user, request: req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), description: "Opis" });
    assert.deepEqual(s, { payerName: "Ion Popescu", payerPhone: "+373 69 000 000", payerIp: "203.0.113.7", description: "Opis" });
  });
  it("без request (автосписание) → payerIp null; пустые значения → null", () => {
    const s = payerSnapshot({ user: { name: "", phone: null }, request: null, description: null });
    assert.deepEqual(s, { payerName: null, payerPhone: null, payerIp: null, description: null });
  });
  it("длинные значения обрезаются (имя 200, описание 300, IP 64)", () => {
    const s = payerSnapshot({ user: { name: "n".repeat(500), phone: "9".repeat(100) }, request: req({ "x-real-ip": "1".repeat(100) }), description: "d".repeat(900) });
    assert.equal(s.payerName?.length, 200);
    assert.equal(s.payerPhone?.length, 32);
    assert.equal(s.payerIp?.length, 64);
    assert.equal(s.description?.length, 300);
  });
});
