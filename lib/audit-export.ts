// Выгрузка журнала в XLSX (xlsx-js-style — уже есть в проекте). Чистые функции (без БД и сети).
// Колонки фиксированы и берутся только из отчётных выборок (lib/audit-queries.ts): паролей, токенов,
// IP и user-agent там нет по построению. Значения, начинающиеся с = + - @, экранируются
// (защита от «формул» в Excel: имя/e-mail вводит сам пользователь).
import * as XLSXns from "xlsx-js-style";

import type { AdminLogRow, CadastruRow, LoginRow, UsageDayRow, UsageUserRow } from "@/lib/audit-queries";
import { FEATURES, FEATURE_LABEL } from "@/lib/audit-queries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const XLSX: any = (XLSXns as any).default ?? XLSXns;

export type Cell = string | number;
export type Sheet = { name: string; header: string[]; rows: Cell[][] };

const FORMULA_START = /^[=+\-@\t\r]/;
export function sanitizeCell(v: unknown): Cell {
  if (typeof v === "number") return Number.isFinite(v) ? v : "";
  const s = v === null || v === undefined ? "" : String(v);
  return FORMULA_START.test(s) ? `'${s}` : s;
}

export function loginSheet(rows: LoginRow[]): Sheet[] {
  return [{ name: "Intrări", header: ["Data și ora (Chișinău)", "Utilizator", "Nume", "Rezultat"], rows: rows.map((r) => [r.at, r.user, r.name, r.result]) }];
}
export function cadastruSheet(rows: CadastruRow[]): Sheet[] {
  return [{
    name: "Verificări cadastrale",
    header: ["Data și ora (Chișinău)", "Utilizator", "Nume", "Număr cadastral", "Rezultat", "Încercări", "ms", "ID cerere"],
    rows: rows.map((r) => [r.at, r.user, r.name, r.cadastralNo, r.result, r.attempts, r.ms, r.requestId]),
  }];
}
export function adminSheet(rows: AdminLogRow[]): Sheet[] {
  return [{
    name: "Acțiuni admin",
    header: ["Data și ora (Chișinău)", "Tip", "Acțiune", "Efectuat de", "Utilizator vizat", "Detalii"],
    rows: rows.map((r) => [r.at, r.type, r.action, r.actor, r.subject, r.details]),
  }];
}
export function consumSheets(byDay: UsageDayRow[], byUser: UsageUserRow[]): Sheet[] {
  const feats = FEATURES.map((f) => FEATURE_LABEL[f]);
  return [
    { name: "Pe zile", header: ["Ziua", ...feats, "Total"], rows: byDay.map((d) => [d.day, ...FEATURES.map((f) => d.counts[f] ?? 0), d.total]) },
    { name: "Pe utilizatori", header: ["Utilizator", "Nume", ...feats, "Total"], rows: byUser.map((u) => [u.user, u.name, ...FEATURES.map((f) => u.counts[f] ?? 0), u.total]) },
  ];
}

// Лимит строк выгрузки: выбирали MAX+1 строку, чтобы отличить «ровно MAX» от «больше MAX».
export function capRows<T>(rows: T[], max: number): { rows: T[]; overflow: boolean } {
  return rows.length > max ? { rows: rows.slice(0, max), overflow: true } : { rows, overflow: false };
}

export const sheetRowCount = (sheets: Sheet[]) => sheets.reduce((n, s) => n + s.rows.length, 0);

export function workbookBuffer(sheets: Sheet[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const aoa = [s.header, ...s.rows.map((r) => r.map(sanitizeCell))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = s.header.map((h, i) => ({
      wch: Math.min(60, Math.max(h.length, ...s.rows.slice(0, 200).map((r) => String(r[i] ?? "").length)) + 2),
    }));
    // Заголовок — жирным.
    s.header.forEach((_, i) => {
      const c = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
      if (c) c.s = { font: { bold: true } };
    });
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
