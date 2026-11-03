import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyDecline } from "@/lib/cybersource/declines";

describe("классификация отказа автосписания", () => {
  it("жёсткие — карта недействительна/утеряна/заблокирована, нужен клиент", () => {
    for (const reason of ["EXPIRED_CARD", "STOLEN_LOST_CARD", "INVALID_ACCOUNT", "UNAUTHORIZED_CARD", "SUSPENDED_ACCOUNT", "BLOCKED_BY_CARDHOLDER", "CONSUMER_AUTHENTICATION_REQUIRED"]) {
      assert.equal(classifyDecline({ reason }), "hard", reason);
    }
  });
  it("мягкие — нет средств, лимит, временный сбой, общий отказ и неизвестное", () => {
    for (const reason of ["INSUFFICIENT_FUND", "EXCEEDS_CREDIT_LIMIT", "ISSUER_UNAVAILABLE", "PROCESSOR_ERROR", "GENERAL_DECLINE", "PROCESSOR_DECLINED", "CONTACT_PROCESSOR", "SOMETHING_NEW", ""]) {
      assert.equal(classifyDecline({ reason }), "soft", reason || "(пусто)");
    }
    assert.equal(classifyDecline({ reason: null }), "soft");
  });
  it("настройки мерчанта — config (клиенту не пишем)", () => {
    assert.equal(classifyDecline({ reason: "INVALID_MERCHANT_CONFIGURATION" }), "config");
  });
  it("Merchant Advice Code «не повторять» делает мягкий отказ жёстким", () => {
    for (const mac of ["1", "01", "03", "21", "99"]) {
      assert.equal(classifyDecline({ reason: "INSUFFICIENT_FUND", merchantAdviceCode: mac }), "hard", mac);
    }
  });
  it("MAC «повторить позже» оставляет мягким; жёсткий reason остаётся жёстким при любом MAC", () => {
    for (const mac of ["2", "02", "24", "30"]) assert.equal(classifyDecline({ reason: "INSUFFICIENT_FUND", merchantAdviceCode: mac }), "soft", mac);
    assert.equal(classifyDecline({ reason: "EXPIRED_CARD", merchantAdviceCode: "02" }), "hard");
  });
  it("регистр reason не важен", () => {
    assert.equal(classifyDecline({ reason: "expired_card" }), "hard");
  });
});
