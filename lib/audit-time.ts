// Даты отчётов: границы дней — по Кишинёву (Europe/Chisinau), а не по UTC. Чистые функции (без БД).
import { JURNAL_DEFAULT_RANGE_DAYS, JURNAL_MAX_RANGE_DAYS, REPORT_TZ } from "@/lib/audit-config";

export function tzOffsetMinutes(utcMs: number, tz: string = REPORT_TZ): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

// "2026-11-17" → реальная календарная дата или null.
export function parseYmd(s: unknown): string | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? s : null;
}

export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function todayYmd(now: Date = new Date(), tz: string = REPORT_TZ): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return p; // en-CA → YYYY-MM-DD
}

// Момент UTC, когда в часовом поясе наступает 00:00 указанной даты.
export function zonedMidnightUtc(ymd: string, tz: string = REPORT_TZ): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const off = tzOffsetMinutes(guess, tz);
  let utc = guess - off * 60000;
  const off2 = tzOffsetMinutes(utc, tz);
  if (off2 !== off) utc = guess - off2 * 60000; // граница перехода на летнее/зимнее время
  return new Date(utc);
}

export type RangeResult =
  | { ok: true; from: Date; toExclusive: Date; fromYmd: string; toYmd: string }
  | { ok: false; error: string };

// Период [from; to] включительно, по дням Кишинёва. По умолчанию — последние 7 дней. Не больше 366 дней.
export function parseRange(fromRaw: unknown, toRaw: unknown, now: Date = new Date()): RangeResult {
  const today = todayYmd(now);
  const toYmd = toRaw === undefined || toRaw === "" || toRaw === null ? today : parseYmd(toRaw);
  if (!toYmd) return { ok: false, error: "Data de sfârșit invalidă." };
  const fromYmd = fromRaw === undefined || fromRaw === "" || fromRaw === null
    ? addDaysYmd(toYmd, -(JURNAL_DEFAULT_RANGE_DAYS - 1))
    : parseYmd(fromRaw);
  if (!fromYmd) return { ok: false, error: "Data de început invalidă." };
  if (fromYmd > toYmd) return { ok: false, error: "Data de început este după data de sfârșit." };
  const days = Math.round((Date.parse(toYmd) - Date.parse(fromYmd)) / 86400000) + 1;
  if (days > JURNAL_MAX_RANGE_DAYS) return { ok: false, error: "Perioada este prea mare (maximum 12 luni)." };
  return { ok: true, from: zonedMidnightUtc(fromYmd), toExclusive: zonedMidnightUtc(addDaysYmd(toYmd, 1)), fromYmd, toYmd };
}

// Для таблиц и Excel: "2026-11-17 15:50:39" по Кишинёву.
export function fmtLocal(d: Date, tz: string = REPORT_TZ): string {
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(d);
  return p;
}
