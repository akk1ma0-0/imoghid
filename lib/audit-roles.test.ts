import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canViewJurnal, checkRoleChange, isAdminRole, isAssignableRole } from "@/lib/audit-roles";

describe("матрица ролей", () => {
  it("ADMIN — админ-панель и журнал; AUDITOR — только журнал; AGENT — ничего", () => {
    assert.deepEqual([isAdminRole("ADMIN"), canViewJurnal("ADMIN")], [true, true]);
    assert.deepEqual([isAdminRole("AUDITOR"), canViewJurnal("AUDITOR")], [false, true]);
    assert.deepEqual([isAdminRole("AGENT"), canViewJurnal("AGENT")], [false, false]);
    assert.deepEqual([isAdminRole(undefined), canViewJurnal(null)], [false, false]);
  });
});

describe("смена роли из интерфейса", () => {
  const ok = { actorId: "a", targetId: "t", targetRole: "AGENT" };
  it("назначаются только AGENT и AUDITOR", () => {
    assert.equal(isAssignableRole("AUDITOR"), true);
    assert.equal(isAssignableRole("AGENT"), true);
    assert.equal(isAssignableRole("ADMIN"), false);
    assert.equal(checkRoleChange({ ...ok, newRole: "ADMIN" }).ok, false);
    assert.equal(checkRoleChange({ ...ok, newRole: "root" }).ok, false);
  });
  it("обычного пользователя можно сделать AUDITOR и обратно", () => {
    assert.equal(checkRoleChange({ ...ok, newRole: "AUDITOR" }).ok, true);
    assert.equal(checkRoleChange({ ...ok, targetRole: "AUDITOR", newRole: "AGENT" }).ok, true);
  });
  it("свою роль менять нельзя", () => {
    assert.equal(checkRoleChange({ ...ok, targetId: "a", newRole: "AUDITOR" }).ok, false);
  });
  it("роль ADMIN менять нельзя (ни в какую сторону)", () => {
    assert.equal(checkRoleChange({ ...ok, targetRole: "ADMIN", newRole: "AGENT" }).ok, false);
    assert.equal(checkRoleChange({ ...ok, targetRole: "ADMIN", newRole: "AUDITOR" }).ok, false);
  });
});
