// paymentUpdateFor: RRN попадает в Payment.rrn только при одобрении и только если он пришёл.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { paymentUpdateFor } from "@/lib/cybersource/payments";
import type { CsDetails } from "@/lib/cybersource/responses";

const details = (over: Partial<CsDetails> = {}): CsDetails => ({
  reason: null, processorCode: "00", approvalCode: "831000", rrn: null, networkTransactionId: "123", reconciliationId: null, merchantAdviceCode: null, ...over,
});

describe("paymentUpdateFor — RRN", () => {
  it("approved с RRN → rrn записывается", () => {
    const u = paymentUpdateFor({ kind: "approved", requestId: "r1", status: "AUTHORIZED", details: details({ rrn: "330412345678" }) } as never);
    assert.equal((u as { rrn?: string }).rrn, "330412345678");
    assert.equal(u.approval, "831000");
  });
  it("approved без RRN → поле rrn не трогаем (не затираем)", () => {
    const u = paymentUpdateFor({ kind: "approved", requestId: "r1", status: "AUTHORIZED", details: details() } as never);
    assert.equal("rrn" in u, false);
  });
  it("declined → rrn не пишем", () => {
    const u = paymentUpdateFor({ kind: "declined", requestId: "r1", status: "DECLINED", details: details({ rrn: "x" }) } as never);
    assert.equal("rrn" in u, false);
  });
});
