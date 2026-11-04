import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isWaitlisted } from "@/lib/waitlist";

const base = { waitlistMode: "true", role: "AGENT", email: "user@example.md", bypassEmails: undefined as string | undefined };

describe("waitlist: кому показывать «ждите приглашение»", () => {
  it("режим выключен → никому", () => {
    assert.equal(isWaitlisted({ ...base, waitlistMode: undefined }), false);
    assert.equal(isWaitlisted({ ...base, waitlistMode: "false" }), false);
  });
  it("режим включён: обычный пользователь — да", () => {
    assert.equal(isWaitlisted(base), true);
  });
  it("админ и email из списка обхода (регистр и пробелы не важны) — нет", () => {
    assert.equal(isWaitlisted({ ...base, role: "ADMIN" }), false);
    assert.equal(isWaitlisted({ ...base, bypassEmails: " Other@x.md , USER@example.md " }), false);
    assert.equal(isWaitlisted({ ...base, bypassEmails: "other@x.md" }), true);
  });
  it("пустой email не совпадает с пустым элементом списка", () => {
    assert.equal(isWaitlisted({ ...base, email: "", bypassEmails: ",," }), true);
    assert.equal(isWaitlisted({ ...base, email: null }), true);
  });
});
