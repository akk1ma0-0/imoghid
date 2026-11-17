// Чистые правила доступа по роли (без БД и сети — легко тестируются).
//   ADMIN   — всё: админ-панель, действия, журнал, выгрузки;
//   AUDITOR — только чтение: журнал «Jurnal» и выгрузки (никаких админ-действий);
//   AGENT   — ничего из этого.
export type Role = "AGENT" | "ADMIN" | "AUDITOR";

export const isAdminRole = (role: string | null | undefined): boolean => role === "ADMIN";
export const canViewJurnal = (role: string | null | undefined): boolean => role === "ADMIN" || role === "AUDITOR";

// Роли, которые админ может назначать из интерфейса. ADMIN выдаётся только через БД.
export const ASSIGNABLE_ROLES = ["AGENT", "AUDITOR"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];
export const isAssignableRole = (v: unknown): v is AssignableRole =>
  typeof v === "string" && (ASSIGNABLE_ROLES as readonly string[]).includes(v);

// Можно ли сменить роль: нельзя себе, нельзя ADMIN-у (ни в какую сторону), только на AGENT/AUDITOR.
export type RoleChangeCheck = { ok: true } | { ok: false; error: string };
export function checkRoleChange(args: {
  actorId: string;
  targetId: string;
  targetRole: string;
  newRole: unknown;
}): RoleChangeCheck {
  if (!isAssignableRole(args.newRole)) return { ok: false, error: "Rol invalid." };
  if (args.actorId === args.targetId) return { ok: false, error: "Nu vă puteți schimba propriul rol." };
  if (args.targetRole === "ADMIN") return { ok: false, error: "Rolul unui administrator nu poate fi schimbat din interfață." };
  return { ok: true };
}
