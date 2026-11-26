// Реквизиты продавца (договор EC7122/231126): единый источник lib/merchant.ts, согласованность с
// юридическими текстами, квитанцией и футером.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { MERCHANT } from "@/lib/merchant";
import { LEGAL_DOCS } from "@/lib/legal-content";
import { buildReceipt } from "@/lib/email";

const allLegal = Object.values(LEGAL_DOCS)
  .flatMap((d) => d.blocks.map((b) => b.text))
  .join("\n");

describe("MERCHANT", () => {
  it("значения по договору", () => {
    assert.equal(MERCHANT.legalName, "BLACKSPACE TECH SRL");
    assert.equal(MERCHANT.idno, "1024600065567");
    assert.equal(MERCHANT.address, "mun. Chișinău, bd. Decebal 99D, of. 40, MD-2038");
    assert.equal(MERCHANT.phone, "+373 69 427 567");
    assert.equal(MERCHANT.email, "info@biseeth.md");
    assert.equal(MERCHANT.supportHours, "Luni–Vineri, 09:00–18:00 (ora Chișinău)");
  });

  it("юридические тексты: то же название, IDNO, адрес, телефон, часы; старой записи нет", () => {
    assert.ok(allLegal.includes(`„BLACKSPACE TECH” SRL, IDNO ${MERCHANT.idno}, sediu mun. Chișinău, bd. Decebal 99D, of. 40, MD-2038`));
    assert.ok(allLegal.includes(MERCHANT.phone));
    assert.ok(allLegal.includes(MERCHANT.supportHours));
    assert.ok(allLegal.includes(MERCHANT.email));
    assert.ok(!/BlackSpace/.test(allLegal));
  });

  it("квитанция: реквизиты из MERCHANT, часы поддержки, ссылка на возврат", () => {
    const r = buildReceipt({
      order: "123456", amount: "300.00", currency: "MDL", customerName: "Ion Test", plan: "BASIC",
      rrn: "123456789012", approval: "A1B2C3", cardLast4: "1111", cardNetwork: "Visa", paidAt: new Date("2026-11-25T10:00:00Z"),
    });
    const v = Object.fromEntries(r.visible);
    assert.equal(v["Comerciant"], MERCHANT.legalName);
    assert.equal(v["Țara comerciantului"], MERCHANT.country);
    assert.equal(v["Site"], MERCHANT.siteUrl);
    assert.equal(v["RRN"], "123456789012");
    assert.equal(v["Cod de autorizare"], "A1B2C3");
    assert.equal(v["Tip operațiune"], "Plată cu cardul Visa");
    assert.match(v["Data și ora"] ?? "", /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
    assert.ok(r.text.includes(`${MERCHANT.phone} · Luni–Vineri, 09:00–18:00, ora Chișinău`));
    assert.ok(r.html.includes(`${MERCHANT.phone} · Luni–Vineri, 09:00–18:00, ora Chișinău`));
    assert.ok(!/\([^()]*\([^()]*\)[^()]*\)/.test(r.text), "вложенных скобок в чеке нет");
    assert.ok(r.html.includes(`${MERCHANT.siteUrl}/termeni#plata-si-rambursare`));
    assert.ok(r.html.includes(MERCHANT.idno));
  });

  it("реквизиты не продублированы в коде страниц (кроме VB_MERCH_*)", () => {
    for (const f of ["lib/email.ts", "app/(public)/LegalDoc.tsx", "components/MerchantFooter.tsx", "app/page.tsx"]) {
      const s = readFileSync(f, "utf8");
      assert.ok(!s.includes(MERCHANT.idno), `${f} не должен хранить IDNO`);
      assert.ok(!s.includes("Decebal"), `${f} не должен хранить адрес`);
    }
  });
});
