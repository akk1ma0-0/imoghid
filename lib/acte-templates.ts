import { readFileSync } from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
// xlsx-js-style — форк SheetJS CE с ЧТЕНИЕМ стилей ячеек (заливка/шрифт/границы),
// и с тем же толерантным парсером (exceljs не смог открыть эти файлы из Google Sheets).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as XLSXns from "xlsx-js-style";

import { ACTE_TEMPLATES_META, type ActeTemplateMeta } from "@/lib/acte-templates-meta";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const XLSX: any = (XLSXns as any).default ?? XLSXns;

// Реестр шаблонных документов «Actele mele». Оригиналы лежат в docs/templates/
// (не копируются в public) и читаются на сервере по запросу, если у пользователя
// нет сохранённой версии.
export type ActeTemplate = ActeTemplateMeta & {
  file: string; // реальное имя файла в docs/templates/ (с пробелами/диакритикой)
};

// Ячейка листа Excel с inline-CSS (цвет, фон, жирность, границы) для рендера на клиенте.
export type ActeCell = { text: string; style: string };
export type ActeSheet = { name: string; rows: ActeCell[][] };

// slug → реальное имя файла на диске (отдельно от клиентских метаданных).
const FILE_BY_SLUG: Record<string, string> = {
  // «Registrul tranzacțiilor» убран из реестра (файл оставлен физически).
  "check-list-acte": "CHECK-LIST acte.docx",
  "tipuri-acte-imobil": "TIPURI DE ACTE.docx",
  "contract-hub-coworking": "Contract_Hub_coworking_RO.docx",
  "contract-colaborare-agent": "Contract_colaborare_agent_agentie_RO.docx",
};

export function getActeTemplate(slug: string): ActeTemplate | undefined {
  const meta = ACTE_TEMPLATES_META.find((t) => t.slug === slug);
  const file = FILE_BY_SLUG[slug];
  if (!meta || !file) return undefined;
  return { ...meta, file };
}

// RGB ("RRGGBB" или "FFRRGGBB") → CSS hex; null если не распознан.
function rgbToHex(rgb: string | undefined): string | null {
  if (!rgb || typeof rgb !== "string") return null;
  const h = rgb.length === 8 ? rgb.slice(2) : rgb;
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h}` : null;
}

// Тёмная ли заливка (по воспринимаемой яркости) — для авто-контраста текста.
function isDarkHex(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Воспринимаемая яркость 0..255; < ~150 считаем тёмной.
  return 0.299 * r + 0.587 * g + 0.114 * b < 150;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cellDisplay(cell: any): string {
  if (!cell) return "";
  if (cell.w != null) return String(cell.w);
  if (cell.v != null) return String(cell.v);
  return "";
}

// Стиль ячейки xlsx-js-style (.s) → строка inline-CSS (заливка/шрифт/границы/выравнивание).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cellCss(s: any): string {
  if (!s) return "";
  const out: string[] = [];
  const fillRgb = s.fill?.fgColor?.rgb ?? s.fgColor?.rgb; // обе формы (вложенная и плоская)
  const bg = rgbToHex(fillRgb);
  if (bg) out.push(`background-color:${bg}`);

  const f = s.font;
  let hasColor = false;
  let hasBold = false;
  if (f) {
    if (f.bold) {
      out.push("font-weight:bold");
      hasBold = true;
    }
    if (f.italic) out.push("font-style:italic");
    if (f.underline) out.push("text-decoration:underline");
    const fc = rgbToHex(f.color?.rgb);
    if (fc) {
      out.push(`color:${fc}`);
      hasColor = true;
    }
    if (f.sz) out.push(`font-size:${f.sz}px`);
  }

  // Авто-контраст: если есть заливка, но файл не задал цвет шрифта —
  // тёмный фон → белый жирный текст, светлый фон → тёмный текст.
  if (bg && !hasColor) {
    if (isDarkHex(bg)) {
      out.push("color:#ffffff");
      if (!hasBold) out.push("font-weight:bold");
    } else {
      out.push("color:#1c2630");
    }
  }

  const b = s.border;
  if (b) {
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const bs = b[side];
      if (bs?.style) {
        const w = bs.style === "thick" || bs.style === "medium" ? "2px" : "1px";
        const col = rgbToHex(bs.color?.rgb) || "#000";
        out.push(`border-${side}:${w} solid ${col}`);
      }
    }
  }

  const al = s.alignment;
  if (al) {
    if (al.horizontal) out.push(`text-align:${al.horizontal}`);
    if (al.vertical) out.push(`vertical-align:${al.vertical === "center" ? "middle" : al.vertical}`);
    if (al.wrapText) out.push("white-space:normal");
  }
  return out.join(";");
}

// Лист → матрица ячеек {текст, .s}; хвостовые пустые строки отброшены.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sheetMatrix(ws: any): { text: string; s: unknown }[][] {
  const ref = ws?.["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows: { text: string; s: unknown }[][] = [];
  for (let R = range.s.r; R <= range.e.r; R++) {
    const row: { text: string; s: unknown }[] = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      row.push({ text: cellDisplay(cell), s: cell?.s });
    }
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].every((c) => c.text.trim() === "")) rows.pop();
  return rows;
}

// Сырые байты оригинального шаблона из docs/templates/ (для docx-preview на клиенте).
export function readOriginalBuffer(tpl: ActeTemplate): Buffer {
  return readFileSync(path.join(process.cwd(), "docs", "templates", tpl.file));
}

// MIME-тип по типу шаблона.
export function mimeOf(tpl: ActeTemplate): string {
  return tpl.type === "docx"
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

// .xlsx → текст: для каждого листа «=== Лист ===» + строки (ячейки через TAB).
function xlsxToText(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer" });
  const parts: string[] = (wb.SheetNames as string[]).map((name) => {
    const tsv = sheetMatrix(wb.Sheets[name])
      .map((row) => row.map((c) => c.text.replace(/[\t\n]/g, " ")).join("\t"))
      .join("\n");
    return `=== ${name} ===\n${tsv}`;
  });
  return parts.join("\n\n").trim();
}

// .xlsx → листы со стилями ячеек (заливка/шрифт/границы) для рендера на клиенте.
export async function loadOriginalSheets(tpl: ActeTemplate): Promise<ActeSheet[]> {
  const wb = XLSX.read(readOriginalBuffer(tpl), { type: "buffer", cellStyles: true });
  return (wb.SheetNames as string[]).map((name) => ({
    name,
    rows: sheetMatrix(wb.Sheets[name]).map((row) =>
      row.map((c) => ({ text: c.text, style: cellCss(c.s) })),
    ),
  }));
}

// Читает оригинальный шаблон из docs/templates/ и конвертирует в текст.
export async function loadOriginalTemplateText(tpl: ActeTemplate): Promise<string> {
  if (tpl.type === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: readOriginalBuffer(tpl) });
    return value.trim();
  }
  return xlsxToText(readOriginalBuffer(tpl));
}
