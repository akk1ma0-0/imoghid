// Регрессия решений о доступе к /app/* (чистая функция, без БД): пользователь без плана,
// с планом, ADMIN и заблокированный. Роль на доступ к /app/* не влияет.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideAppAccess, type AccessUser } from "@/lib/auth-access";
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
  it("журнал и админ-панель gate пускает по плану; закрывает их серверная проверка роли ADMIN (404)", () => {
    assert.deepEqual(at("/app/admin/jurnal", u), { kind: "allow" });
    assert.deepEqual(at("/app/admin", u), { kind: "allow" });
  });
});

describe("ADMIN", () => {
  const admin = { ...base, role: "ADMIN", plan: "PRO" };
  it("с планом: админ-панель и журнал доступны", () => {
    assert.deepEqual(at("/app/admin", admin), { kind: "allow" });
    assert.deepEqual(at("/app/admin/jurnal", admin), { kind: "allow" });
  });
  it("прежнее поведение сохранено: ADMIN без плана тоже уходит на /app/pending", () => {
    assert.deepEqual(at("/app/admin", { ...admin, plan: null }), { kind: "redirect", to: "/app/pending" });
  });
});

describe("зарезервированное значение роли AUDITOR (в enum осталось, не используется)", () => {
  it("не даёт никаких особых прав: без плана — на /app/pending, как обычный пользователь", () => {
    const u = { ...base, role: "AUDITOR" };
    for (const p of ["/app", "/app/cadastru", "/app/admin/jurnal", "/app/profile"]) {
      assert.deepEqual(at(p, u), { kind: "redirect", to: "/app/pending" }, p);
    }
    assert.deepEqual(at("/app/cadastru", { ...u, plan: "BASIC" }), { kind: "allow" });
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
  it("заблокированный админ — тоже", () => {
    for (const role of ["ADMIN", "AGENT"] as const) {
      assert.equal(applyDbUserToToken({ id: "u", sessionVersion: 0 }, { ...db, role, isBlocked: true }), null);
    }
  });
});
