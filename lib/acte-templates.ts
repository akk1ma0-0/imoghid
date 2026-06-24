import { readFileSync } from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

import { ACTE_TEMPLATES_META, type ActeTemplateMeta } from "@/lib/acte-templates-meta";

// Реестр шаблонных документов «Actele mele». Оригиналы лежат в docs/templates/
// (не копируются в public) и читаются на сервере по запросу, если у пользователя
// нет сохранённой версии.
export type ActeTemplate = ActeTemplateMeta & {
  file: string; // реальное имя файла в docs/templates/ (с пробелами/диакритикой)
};

// slug → реальное имя файла на диске (отдельно от клиентских метаданных).
const FILE_BY_SLUG: Record<string, string> = {
  "registrul-tranzactiilor": "Registrul Tranzacțiilor.xlsx",
  "check-list-acte": "CHECK-LIST acte.docx",
  "tipuri-acte-imobil": "Tipuri de acte imobilului.xlsx",
  "contract-hub-coworking": "Contract_Hub_coworking_RO.docx",
  "contract-colaborare-agent": "Contract_colaborare_agent_agentie_RO.docx",
};

export function getActeTemplate(slug: string): ActeTemplate | undefined {
  const meta = ACTE_TEMPLATES_META.find((t) => t.slug === slug);
  const file = FILE_BY_SLUG[slug];
  if (!meta || !file) return undefined;
  return { ...meta, file };
}

// .xlsx → читаемый текст: для каждого листа заголовок «=== Лист ===» + строки (TSV).
function xlsxToText(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", blankrows: false });
    parts.push(`=== ${name} ===\n${csv.trimEnd()}`);
  }
  return parts.join("\n\n").trim();
}

// Читает оригинальный шаблон из docs/templates/ и конвертирует в текст.
export async function loadOriginalTemplateText(tpl: ActeTemplate): Promise<string> {
  const abs = path.join(process.cwd(), "docs", "templates", tpl.file);
  const buf = readFileSync(abs);
  if (tpl.type === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value.trim();
  }
  return xlsxToText(buf);
}
