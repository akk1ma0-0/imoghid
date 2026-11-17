// Журнал аудита: входы, действия администраторов, выгрузки и расход функций (UsageEvent).
// ВСЕ записи best-effort: сбой БД логируется и НИКОГДА не ломает вход / действие пользователя.
// Без IP, user-agent, паролей, токенов и введённых email (см. scrubMeta).

import type { AuditEventType, Prisma, UsageFeature } from "@prisma/client";

import { LOGIN_FAILED_THROTTLE_MS } from "@/lib/audit-config";
import { prisma } from "@/lib/prisma";

export type AuditMeta = Record<string, string | number | boolean | null>;

// Защита в глубину: ключи, похожие на секреты/e-mail/IP, в meta не попадают.
const FORBIDDEN_KEY = /pass|token|secret|authorization|cookie|e-?mail|\bip\b|user-?agent|iban|card/i;
export function scrubMeta(meta: Record<string, unknown> | undefined | null): AuditMeta | null {
  if (!meta) return null;
  const out: AuditMeta = {};
  for (const [k, v] of Object.entries(meta)) {
    if (FORBIDDEN_KEY.test(k)) continue;
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = typeof v === "string" ? v.slice(0, 200) : v;
    }
  }
  return Object.keys(out).length ? out : null;
}

function logWriteFailure(what: string) {
  // Без идентификаторов пользователя — только что именно не записалось.
  console.error(JSON.stringify({ evt: "audit_write_failed", what, alert: "AUDIT_JOURNAL" }));
}

async function write(
  type: AuditEventType,
  data: { userId?: string | null; actorId?: string | null; action?: string | null; meta?: AuditMeta | null },
): Promise<boolean> {
  try {
    await prisma.auditEvent.create({
      data: {
        type,
        userId: data.userId ?? null,
        actorId: data.actorId ?? null,
        action: data.action ?? null,
        meta: (data.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    return true;
  } catch {
    logWriteFailure(type);
    return false;
  }
}

// Успешный вход: только пользователь и время.
export const recordLogin = (userId: string) => write("LOGIN", { userId });

// Неудачный вход — ТОЛЬКО для существующего пользователя (вызывать после findUnique по email).
// Пароль и введённый email не передаются. Не чаще одной записи на пользователя за окно.
export async function recordLoginFailed(
  userId: string,
  reason: "BAD_PASSWORD" | "BLOCKED",
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const recent = await prisma.auditEvent.findFirst({
      where: { type: "LOGIN_FAILED", userId, createdAt: { gte: new Date(now.getTime() - LOGIN_FAILED_THROTTLE_MS) } },
      select: { id: true },
    });
    if (recent) return false;
  } catch {
    logWriteFailure("LOGIN_FAILED_THROTTLE");
    return false;
  }
  return write("LOGIN_FAILED", { userId, action: reason });
}

export type AdminAction =
  | "CHANGE_PLAN"
  | "BLOCK"
  | "UNBLOCK"
  | "CHANGE_ROLE"
  | "DELETE_USER"
  | "AGENCY_CREATE"
  | "CS_OPERATION"
  | "CS_BILLING_RUN"
  | "VB_TEST_INITIATE"
  | "VB_TEST_REFUND";

// Действие администратора: actorId — кто, userId — над кем (если применимо; у удалённого — только id).
export const recordAdminAction = (args: {
  actorId: string;
  userId?: string | null;
  action: AdminAction;
  meta?: Record<string, unknown>;
}) => write("ADMIN_ACTION", { actorId: args.actorId, userId: args.userId ?? null, action: args.action, meta: scrubMeta(args.meta) });

// Выгрузка: тип, период и число строк.
export const recordExport = (args: {
  actorId: string;
  exportType: string;
  rows: number;
  from: string;
  to: string;
  userFilter: boolean;
}) =>
  write("EXPORT", {
    actorId: args.actorId,
    action: `EXPORT:${args.exportType}`,
    meta: scrubMeta({ rows: args.rows, from: args.from, to: args.to, userFilter: args.userFilter }),
  });

// ── UsageEvent ──────────────────────────────────────────────────────────────

export type UsageEventKind = "counter" | "single" | "overage" | "none";

// Возвращает id события (для последующего возврата резерва) или null при сбое записи.
export async function recordUsageEvent(
  userId: string,
  feature: UsageFeature,
  kind: UsageEventKind,
): Promise<string | null> {
  try {
    const e = await prisma.usageEvent.create({ data: { userId, feature, kind }, select: { id: true } });
    return e.id;
  } catch {
    logWriteFailure("USAGE_EVENT");
    return null;
  }
}

// Резерв возвращён (действие не состоялось) — событие в отчётах не учитывается.
export async function markUsageEventReleased(eventId: string | undefined | null): Promise<void> {
  if (!eventId) return;
  try {
    await prisma.usageEvent.updateMany({ where: { id: eventId, releasedAt: null }, data: { releasedAt: new Date() } });
  } catch {
    logWriteFailure("USAGE_EVENT_RELEASE");
  }
}
