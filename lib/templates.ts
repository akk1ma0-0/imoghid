import { readFileSync } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

import { numToRoWords, formatDateRo, splitDateRo } from "@/lib/ro-words";

// Реестр шаблонов Instrumente. Файлы в docs/templates/, плейсхолдеры — теги {tag}.
export const TEMPLATES = {
  garantie: {
    filename: "Garanție de cumpărare.docx",
    label: "Garanție de cumpărare",
    outName: "Garantie_de_cumparare",
  },
  contract: {
    filename: "Contract_intermediere_exclusiv.docx",
    label: "Contract de intermediere",
    outName: "Contract_intermediere",
  },
} as const;

export type TemplateName = keyof typeof TEMPLATES;

export function isTemplateName(k: unknown): k is TemplateName {
  return typeof k === "string" && k in TEMPLATES;
}

// Серверные преобразования: цифры → прописью, дата → DD.MM.YYYY или разбивка zi/luna/an.
function derive(templateName: TemplateName, data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  // Переносим только непустые значения; пустые → undefined → nullGetter («____»).
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string" && v.trim() !== "") out[k] = v.trim();
  }

  if (templateName === "garantie") {
    if (out.suma_garantie_cifre) {
      out.suma_garantie_litere = numToRoWords(out.suma_garantie_cifre);
    }
    // Даты целиком (одиночные теги) → DD.MM.YYYY
    for (const k of ["contract_intermediere_data", "termen_rezervare", "data_intocmirii"]) {
      if (out[k]) out[k] = formatDateRo(out[k]);
    }
  }

  if (templateName === "contract") {
    if (out.durata_cifre) out.durata_litere = numToRoWords(out.durata_cifre);
    // Одна дата → zi / luna(текст) / an(2 цифры). contract_data не является тегом шаблона.
    if (out.contract_data) {
      const { zi, luna, an } = splitDateRo(out.contract_data);
      if (zi) out.contract_zi = zi;
      if (luna) out.contract_luna = luna;
      if (an) out.contract_an = an;
      delete out.contract_data;
    }
  }

  return out;
}

// Генерация .docx через docxtemplater. Незаполненные теги → «____________» (§4: не выдумываем).
export function generateDoc(templateName: TemplateName, data: Record<string, string>): Buffer {
  const abs = path.join(process.cwd(), "docs", "templates", TEMPLATES[templateName].filename);
  const content = readFileSync(abs);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "____________",
  });
  doc.render(derive(templateName, data));
  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}
