// Регрессия решений о доступе к /app/* (чистая функция, без БД): пользователь без плана,
// с планом, ADMIN, AUDITOR и заблокированный.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideAppAccess, JURNAL_PATH, type AccessUser } from "@/lib/auth-access";
import { applyDbUserToToken, type DbAuthUser } from "@/lib/auth-token";

const base: AccessUser = { emailConfirmed: true, plan: null, hasSingleAccess: false, isAgencyOwner: false, role: "AGENT" };
const at = (pathname: string, user: AccessUser | null, isDemo = false) => decideAppAccess({ pathname, isDemo, user });

describe("пользователь без плана → /app/pending", () => {
  it("с любой страницы приложения уводим на /app/pending", () => {
    for (const p of ["/app", "/app/cadastru", "/app/objects", "/app/admin", "/app/agency"]) {
      assert.deepEqual(at(p, base), { kind: "redirect", to: "/app/pending" }, p);
    }
  });
  it("но pending / waitlist / checkout доступны", () => {
    assert.deepEqual(at("/app/pending", base), { kind: "allow-pending" });
    assert.deepEqual(at("/app/waitlist", base), { kind: "allow" });
    assert.deepEqual(at("/app/checkout/x", base), { kind: "allow" });
  });
  it("грант «O accesare» или агентство дают доступ", () => {
    assert.deepEqual(at("/app/cadastru", { ...base, hasSingleAccess: true }), { kind: "allow" });
    assert.deepEqual(at("/app/agency", { ...base, isAgencyOwner: true }), { kind: "allow" });
  });
});

describe("пользователь с планом", () => {
  const u = { ...base, plan: "BASIC" };
  it("пускаем в приложение", () => {
    assert.deepEqual(at("/app/cadastru", u), { kind: "allow" });
    assert.deepEqual(at("/app/objects", u), { kind: "allow" });
  });
  it("/app/waitlist ему не нужна → /app; /app/pending остаётся доступной", () => {
    assert.deepEqual(at("/app/waitlist", u), { kind: "redirect", to: "/app" });
    assert.deepEqual(at("/app/pending", u), { kind: "allow-pending" });
  });
  it("в журнал он не попадает через gate: страница сама проверит роль, а gate пускает по плану", () => {
    assert.deepEqual(at(JURNAL_PATH, u), { kind: "allow" }); // доступ закрывает серверная проверка роли
  });
});

describe("ADMIN", () => {
  const admin = { ...base, role: "ADMIN", plan: "PRO" };
  it("с планом: админ-панель и журнал доступны", () => {
    assert.deepEqual(at("/app/admin", admin), { kind: "allow" });
    assert.deepEqual(at(JURNAL_PATH, admin), { kind: "allow" });
  });
  it("прежнее поведение сохранено: ADMIN без плана тоже уходит на /app/pending", () => {
    assert.deepEqual(at("/app/admin", { ...admin, plan: null }), { kind: "redirect", to: "/app/pending" });
  });
});

describe("AUDITOR", () => {
  const aud = { ...base, role: "AUDITOR" };
  it("без плана: журнал и профиль доступны", () => {
    assert.deepEqual(at(JURNAL_PATH, aud), { kind: "allow" });
    assert.deepEqual(at(`${JURNAL_PATH}?type=login`, aud), { kind: "allow" });
    assert.deepEqual(at("/app/profile", aud), { kind: "allow" });
  });
  it("без плана: всё остальное, включая вход на /app, ведёт в журнал, а не на /app/pending", () => {
    for (const p of ["/app", "/app/cadastru", "/app/objects", "/app/admin", "/app/agency", "/app/waitlist", "/app/checkout/x"]) {
      assert.deepEqual(at(p, aud), { kind: "redirect", to: JURNAL_PATH }, p);
    }
  });
  it("с планом: как обычный пользователь", () => {
    assert.deepEqual(at("/app/cadastru", { ...aud, plan: "BASIC" }), { kind: "allow" });
  });
});

describe("сессия, e-mail, demo", () => {
  it("нет сессии → login (кроме /app/pending и demo)", () => {
    assert.deepEqual(at("/app/cadastru", null), { kind: "login" });
    assert.deepEqual(at("/app/pending", null), { kind: "allow-pending" });
    assert.deepEqual(at("/app/cadastru", null, true), { kind: "allow" });
  });
  it("не /app → allow", () => {
    assert.deepEqual(at("/login", null), { kind: "allow" });
  });
  it("e-mail не подтверждён → verify-email-pending; подтверждён там делать нечего", () => {
    const u = { ...base, emailConfirmed: false, plan: "BASIC" };
    assert.deepEqual(at("/app/cadastru", u), { kind: "redirect", to: "/app/verify-email-pending" });
    assert.deepEqual(at("/app/verify-email-pending", u), { kind: "allow" });
    assert.deepEqual(at("/app/verify-email-pending", { ...u, emailConfirmed: true }), { kind: "redirect", to: "/app" });
  });
});

describe("заблокированный пользователь", () => {
  const db: DbAuthUser = {
    sessionVersion: 0, email: "a@x.test", role: "AGENT", isBlocked: false,
    plan: "BASIC", planActive: true, singleAccessCount: 0, ownsAgency: false,
  };
  it("jwt-колбэк аннулирует токен → сессии нет → /login", () => {
    const token = applyDbUserToToken({ id: "u", sessionVersion: 0, email: "a@x.test" }, { ...db, isBlocked: true });
    assert.equal(token, null);
    assert.deepEqual(at("/app/cadastru", token ? { ...base } : null), { kind: "login" });
  });
  it("заблокированный админ/аудитор — тоже", () => {
    for (const role of ["ADMIN", "AUDITOR"] as const) {
      assert.equal(applyDbUserToToken({ id: "u", sessionVersion: 0 }, { ...db, role, isBlocked: true }), null);
    }
  });
});
