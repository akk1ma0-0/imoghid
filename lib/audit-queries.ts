// Выборки журнала «Jurnal» — общие для экрана (JSON API) и выгрузки XLSX.
// Дни группируются по Кишинёву. Ничего чувствительного (пароли, токены, IP) в выборки не попадает.
import { Prisma } from "@prisma/client";

import { JURNAL_PAGE_SIZE, REPORT_TZ } from "@/lib/audit-config";
import { fmtLocal, parseRange } from "@/lib/audit-time";
import { prisma } from "@/lib/prisma";

export type JurnalFilter = { from: Date; toExclusive: Date; userIds: string[] | null }; // null = все

export const FEATURE_LABEL: Record<string, string> = {
  CADASTRU_CHECK: "Verificări cadastrale",
  DOSAR_ANALYSIS: "Analize dosar",
  CREATOR_HUB: "Creator Hub",
  ANUNT_999: "Anunțuri 999",
  OBIECTE_CREATE: "Creare dosar (acces unic)",
};
export const FEATURES = Object.keys(FEATURE_LABEL);

// Поиск пользователей по части e-mail → список id. null — фильтра нет; [] — никого не нашли.
export async function resolveUserFilter(q: unknown): Promise<string[] | null> {
  const s = typeof q === "string" ? q.trim().slice(0, 100) : "";
  if (!s) return null;
  const rows = await prisma.user.findMany({
    where: { email: { contains: s, mode: "insensitive" } },
    select: { id: true },
    take: 50,
  });
  return rows.map((r) => r.id);
}

type Label = { email: string; name: string };
async function labels(ids: (string | null | undefined)[]): Promise<Map<string, Label>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return new Map();
  const rows = await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, email: true, name: true } });
  return new Map(rows.map((r) => [r.id, { email: r.email, name: r.name }]));
}
const who = (m: Map<string, Label>, id: string | null | undefined) =>
  id ? m.get(id)?.email ?? `(șters) ${id.slice(0, 8)}` : "—";

export type Page<T> = { total: number; rows: T[] };
type PageOpts = { page: number; limit: number | null }; // limit null = без пагинации (выгрузка)
const skipTake = (o: PageOpts): { skip?: number; take?: number } =>
  o.limit === null ? {} : { skip: (Math.max(o.page, 1) - 1) * o.limit, take: o.limit };
export const defaultPage = (page: unknown): PageOpts => ({ page: Math.max(Number(page) || 1, 1), limit: JURNAL_PAGE_SIZE });

const EMPTY = { total: 0, rows: [] as never[] };

export type LoginRow = { at: string; user: string; name: string; result: string };
export async function queryLogins(f: JurnalFilter, o: PageOpts): Promise<Page<LoginRow>> {
  if (f.userIds && !f.userIds.length) return EMPTY;
  const where: Prisma.AuditEventWhereInput = {
    type: { in: ["LOGIN", "LOGIN_FAILED"] },
    createdAt: { gte: f.from, lt: f.toExclusive },
    ...(f.userIds ? { userId: { in: f.userIds } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(o) }),
  ]);
  const m = await labels(rows.map((r) => r.userId));
  return {
    total,
    rows: rows.map((r) => ({
      at: fmtLocal(r.createdAt),
      user: who(m, r.userId),
      name: (r.userId && m.get(r.userId)?.name) || "",
      result: r.type === "LOGIN" ? "Intrare reușită" : r.action === "BLOCKED" ? "Eșuată (cont blocat)" : "Eșuată (parolă greșită)",
    })),
  };
}

export type CadastruRow = { at: string; user: string; name: string; cadastralNo: string; result: string; attempts: number; ms: number; requestId: string };
export async function queryCadastru(f: JurnalFilter, o: PageOpts): Promise<Page<CadastruRow>> {
  if (f.userIds && !f.userIds.length) return EMPTY;
  const where: Prisma.CadastruCheckWhereInput = {
    createdAt: { gte: f.from, lt: f.toExclusive },
    ...(f.userIds ? { userId: { in: f.userIds } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.cadastruCheck.count({ where }),
    prisma.cadastruCheck.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(o) }),
  ]);
  const m = await labels(rows.map((r) => r.userId));
  return {
    total,
    rows: rows.map((r) => ({
      at: fmtLocal(r.createdAt),
      user: who(m, r.userId),
      name: m.get(r.userId)?.name ?? "",
      cadastralNo: r.cadastralNo,
      result: r.outcome,
      attempts: r.attempts,
      ms: r.ms,
      requestId: r.requestId,
    })),
  };
}

export type UsageDayRow = { day: string; counts: Record<string, number>; total: number };
export type UsageUserRow = { user: string; name: string; counts: Record<string, number>; total: number };

const userCond = (f: JurnalFilter) => (f.userIds ? Prisma.sql`AND "userId" IN (${Prisma.join(f.userIds)})` : Prisma.empty);

export async function queryUsageByDay(f: JurnalFilter): Promise<UsageDayRow[]> {
  if (f.userIds && !f.userIds.length) return [];
  // createdAt хранится как UTC без пояса: сначала «это UTC», затем перевод в Кишинёв.
  const rows = await prisma.$queryRaw<{ day: string; feature: string; n: number }[]>(Prisma.sql`
    SELECT to_char((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${REPORT_TZ})::date, 'YYYY-MM-DD') AS day,
           feature::text AS feature, COUNT(*)::int AS n
    FROM usage_events
    WHERE "createdAt" >= ${f.from} AND "createdAt" < ${f.toExclusive} AND "releasedAt" IS NULL ${userCond(f)}
    GROUP BY 1, 2 ORDER BY 1 DESC, 2`);
  const byDay = new Map<string, UsageDayRow>();
  for (const r of rows) {
    const d = byDay.get(r.day) ?? { day: r.day, counts: {}, total: 0 };
    d.counts[r.feature] = r.n;
    d.total += r.n;
    byDay.set(r.day, d);
  }
  return [...byDay.values()];
}

export async function queryUsageByUser(f: JurnalFilter): Promise<UsageUserRow[]> {
  if (f.userIds && !f.userIds.length) return [];
  const rows = await prisma.$queryRaw<{ userId: string; feature: string; n: number }[]>(Prisma.sql`
    SELECT "userId", feature::text AS feature, COUNT(*)::int AS n
    FROM usage_events
    WHERE "createdAt" >= ${f.from} AND "createdAt" < ${f.toExclusive} AND "releasedAt" IS NULL ${userCond(f)}
    GROUP BY 1, 2`);
  const m = await labels(rows.map((r) => r.userId));
  const byUser = new Map<string, UsageUserRow>();
  for (const r of rows) {
    const u = byUser.get(r.userId) ?? { user: who(m, r.userId), name: m.get(r.userId)?.name ?? "", counts: {}, total: 0 };
    u.counts[r.feature] = r.n;
    u.total += r.n;
    byUser.set(r.userId, u);
  }
  return [...byUser.values()].sort((a, b) => b.total - a.total).slice(0, 500);
}

export type AdminLogRow = { at: string; type: string; action: string; actor: string; subject: string; details: string };
export async function queryAdminLog(f: JurnalFilter, o: PageOpts): Promise<Page<AdminLogRow>> {
  if (f.userIds && !f.userIds.length) return EMPTY;
  const where: Prisma.AuditEventWhereInput = {
    type: { in: ["ADMIN_ACTION", "EXPORT"] },
    createdAt: { gte: f.from, lt: f.toExclusive },
    ...(f.userIds ? { OR: [{ userId: { in: f.userIds } }, { actorId: { in: f.userIds } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(o) }),
  ]);
  const m = await labels(rows.flatMap((r) => [r.userId, r.actorId]));
  return {
    total,
    rows: rows.map((r) => ({
      at: fmtLocal(r.createdAt),
      type: r.type,
      action: r.action ?? "",
      actor: who(m, r.actorId),
      subject: r.userId ? who(m, r.userId) : "—",
      details: r.meta && typeof r.meta === "object" ? Object.entries(r.meta as Record<string, unknown>).map(([k, v]) => `${k}=${String(v)}`).join(", ") : "",
    })),
  };
}

// ── Разбор параметров запроса (общий для JSON-API и выгрузки) ──
export type JurnalType = "login" | "cadastru" | "consum" | "admin";
export const JURNAL_TYPES: readonly JurnalType[] = ["login", "cadastru", "consum", "admin"];
export const isJurnalType = (v: unknown): v is JurnalType => typeof v === "string" && (JURNAL_TYPES as readonly string[]).includes(v);

export type JurnalParams =
  | { ok: true; type: JurnalType; filter: JurnalFilter; fromYmd: string; toYmd: string; hasUser: boolean; page: number }
  | { ok: false; error: string };

export async function parseJurnalParams(sp: URLSearchParams, now: Date = new Date()): Promise<JurnalParams> {
  const type = sp.get("type");
  if (!isJurnalType(type)) return { ok: false, error: "Tip de raport invalid." };
  const r = parseRange(sp.get("from"), sp.get("to"), now);
  if (!r.ok) return r;
  const userIds = await resolveUserFilter(sp.get("q"));
  return {
    ok: true,
    type,
    filter: { from: r.from, toExclusive: r.toExclusive, userIds },
    fromYmd: r.fromYmd,
    toYmd: r.toYmd,
    hasUser: userIds !== null,
    page: Math.max(Number(sp.get("page")) || 1, 1),
  };
}
