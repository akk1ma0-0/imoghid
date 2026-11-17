// jwt-колбэк: освежение токена из БД (роль, блокировка, sessionVersion, план).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyDbUserToToken, type DbAuthUser } from "@/lib/auth-token";

const db: DbAuthUser = {
  sessionVersion: 3, email: "new@x.test", role: "AGENT", isBlocked: false,
  plan: "PRO", planActive: true, singleAccessCount: 2, ownsAgency: true,
};

describe("applyDbUserToToken", () => {
  it("роль, план, грант и агентство берутся из БД; e-mail освежается", () => {
    const t = applyDbUserToToken<Record<string, unknown>>({ id: "u", sessionVersion: 3, email: "old@x.test", role: "ADMIN", plan: null }, db)!;
    assert.equal(t.role, "AGENT"); // понижение админа действует сразу
    assert.equal(t.plan, "PRO");
    assert.equal(t.planActive, true);
    assert.equal(t.hasSingleAccess, true);
    assert.equal(t.isAgencyOwner, true);
    assert.equal(t.email, "new@x.test");
  });
  it("назначение AUDITOR подхватывается без перелогина", () => {
    const t = applyDbUserToToken({ id: "u", sessionVersion: 3, role: "AGENT" }, { ...db, role: "AUDITOR" })!;
    assert.equal(t.role, "AUDITOR");
  });
  it("пользователь удалён → null", () => {
    assert.equal(applyDbUserToToken({ id: "u", sessionVersion: 0 }, null), null);
  });
  it("рассинхрон sessionVersion → null (выход со всех устройств)", () => {
    assert.equal(applyDbUserToToken({ id: "u", sessionVersion: 2 }, db), null);
  });
  it("токен без claim sessionVersion трактуется как 0", () => {
    assert.notEqual(applyDbUserToToken({ id: "u" }, { ...db, sessionVersion: 0 }), null);
    assert.equal(applyDbUserToToken({ id: "u" }, db), null);
  });
  it("заблокирован → null, даже если sessionVersion совпадает", () => {
    assert.equal(applyDbUserToToken({ id: "u", sessionVersion: 3 }, { ...db, isBlocked: true }), null);
  });
});
