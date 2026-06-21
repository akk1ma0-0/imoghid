import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

import type { DocInput, ExtractedFields } from "@/lib/analyze/types";
import { generateFlags, isAllUppercaseName } from "@/lib/analyze/flags";

const MODEL = "claude-sonnet-4-6";

// Системный промпт Pasul 3 = Секция 3 из docs/imoghid-reference.md (между «## 3.» и «## 4.»).
// Читается заново при каждом анализе, чтобы правки в .md подхватывались без перезапуска.
const FALLBACK_STEP3_PROMPT =
  "Ești Georgii, motorul de verificare a actelor imobiliare din Republica Moldova. " +
  "Răspunde STRICT în JSON: { objects:[{objectIndex, overallStatus, extractedFields:[{fieldName,value,isActualized}], " +
  "flags:[{code,severity,zone,titleRo,descriptionRo,legalRef}]}], escalations:[], summary:{...} }.";

function loadSystemPrompt(): string {
  try {
    const full = readFileSync(
      path.join(process.cwd(), "docs", "imoghid-reference.md"),
      "utf8",
    );
    const start = full.indexOf("## 3.");
    if (start < 0) return FALLBACK_STEP3_PROMPT;
    const end = full.indexOf("## 4.", start);
    return full.slice(start, end < 0 ? undefined : end).trim();
  } catch {
    return FALLBACK_STEP3_PROMPT;
  }
}

// ── Структура ответа Claude (Pasul 3) ──
export type AnalysisFieldEntry = {
  fieldName: string;
  value: string | null;
  isActualized: boolean | null;
};
export type AnalysisFlag = {
  code: string;
  severity: "RED" | "AMBER" | "GREEN";
  zone: "VERIFICAT" | "VERIFICARE_MANUALA" | "IN_AFARA_ZONEI";
  titleRo: string;
  descriptionRo: string | null;
  legalRef: string | null;
};
export type AnalysisObject = {
  objectIndex: number;
  overallStatus: string;
  extractedFields: AnalysisFieldEntry[];
  flags: AnalysisFlag[];
};
export type ClaudeAnalysis = {
  objects: AnalysisObject[];
  escalations: { reason: string; specialist: string }[];
  summary: {
    overallStatus: string;
    verifiedCount: number;
    manualReviewCount: number;
    outOfScopeCount: number;
  };
};

// JSON-схема структурированного вывода. severity допускает ORANGE (как в промпте) — нормализуется в AMBER.
const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    objects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          objectIndex: { type: "integer" },
          overallStatus: { type: "string", enum: ["RED", "AMBER", "GREEN"] },
          extractedFields: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                fieldName: { type: "string" },
                value: { type: ["string", "null"] },
                isActualized: { type: ["boolean", "null"] },
              },
              required: ["fieldName", "value", "isActualized"],
            },
          },
          flags: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                code: { type: "string" },
                severity: { type: "string", enum: ["RED", "AMBER", "GREEN", "ORANGE"] },
                zone: {
                  type: "string",
                  enum: ["VERIFICAT", "VERIFICARE_MANUALA", "IN_AFARA_ZONEI"],
                },
                titleRo: { type: "string" },
                descriptionRo: { type: ["string", "null"] },
                legalRef: { type: ["string", "null"] },
              },
              required: ["code", "severity", "zone", "titleRo", "descriptionRo", "legalRef"],
            },
          },
        },
        required: ["objectIndex", "overallStatus", "extractedFields", "flags"],
      },
    },
    escalations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { reason: { type: "string" }, specialist: { type: "string" } },
        required: ["reason", "specialist"],
      },
    },
    summary: {
      type: "object",
      additionalProperties: false,
      properties: {
        overallStatus: { type: "string" },
        verifiedCount: { type: "integer" },
        manualReviewCount: { type: "integer" },
        outOfScopeCount: { type: "integer" },
      },
      required: ["overallStatus", "verifiedCount", "manualReviewCount", "outOfScopeCount"],
    },
  },
  required: ["objects", "escalations", "summary"],
} as const;

// Детерминированный stub (данные как в дизайне) — когда нет ключа или при ошибке.
function stubExtract(objectIndex: number): ExtractedFields {
  if (objectIndex === 2) {
    return {
      cadastralNo: "0100418.027.0094",
      address: "bd. Moscova 14, ap. 3, Chișinău",
      owner_names: ["POPESCU IONEL"],
      area_act: "58,4",
      area_extras: "58,4",
      legal_basis: "Contract de donație, 2015",
      encumbrances: "",
      purchase_price: "600000",
      seller_is_legal_entity: false,
    };
  }
  return {
    cadastralNo: "0100225.041.0212",
    address: "str. Independenței 42, ap. 7, Chișinău",
    owner_names: ["POPESCU IONEL", "Grosu M.V."],
    area_act: "60,1",
    area_extras: "58,4",
    legal_basis: "Contract de vânzare-cumpărare, 2009",
    encumbrances: "",
    purchase_price: "430000",
    seller_is_legal_entity: false,
  };
}

function fieldsToEntries(f: ExtractedFields): AnalysisFieldEntry[] {
  const entries: AnalysisFieldEntry[] = [];
  const single: [string, string | null][] = [
    ["cadastralNo", f.cadastralNo],
    ["address", f.address],
    ["area_act", f.area_act],
    ["area_extras", f.area_extras],
    ["legal_basis", f.legal_basis],
    ["encumbrances", f.encumbrances],
    ["purchase_price", f.purchase_price],
  ];
  for (const [fieldName, value] of single) {
    if (value !== null && value !== undefined) entries.push({ fieldName, value, isActualized: null });
  }
  for (const name of f.owner_names) {
    entries.push({ fieldName: "owner_name", value: name, isActualized: isAllUppercaseName(name) });
  }
  return entries;
}

// Stub-анализ в новой структуре (поля из дизайна + детерминированные флаги). Логика без изменений.
function stubAnalysis(indices: number[]): ClaudeAnalysis {
  const objects: AnalysisObject[] = indices.map((idx) => {
    const f = stubExtract(idx);
    const flags: AnalysisFlag[] = generateFlags(f, idx).map((fl) => ({
      code: fl.code,
      severity: fl.severity,
      zone: fl.zone,
      titleRo: fl.titleRo,
      descriptionRo: fl.descriptionRo,
      legalRef: null,
    }));
    const overallStatus = flags.some((x) => x.severity === "RED")
      ? "RED"
      : flags.some((x) => x.severity === "AMBER")
        ? "AMBER"
        : "GREEN";
    return { objectIndex: idx, overallStatus, extractedFields: fieldsToEntries(f), flags };
  });
  const manualReviewCount = objects.reduce(
    (a, o) => a + o.flags.filter((x) => x.severity !== "GREEN").length,
    0,
  );
  const overallStatus = objects.some((o) => o.overallStatus === "RED")
    ? "RED"
    : objects.some((o) => o.overallStatus === "AMBER")
      ? "AMBER"
      : "GREEN";
  return {
    objects,
    escalations: [],
    summary: { overallStatus, verifiedCount: 0, manualReviewCount, outOfScopeCount: 0 },
  };
}

function coerceSeverity(s: unknown): "RED" | "AMBER" | "GREEN" {
  const up = String(s).toUpperCase();
  if (up === "RED" || up === "GREEN") return up;
  return "AMBER"; // ORANGE и всё прочее → AMBER (оранжевый вид даётся по code в UI)
}
function coerceZone(z: unknown): "VERIFICAT" | "VERIFICARE_MANUALA" | "IN_AFARA_ZONEI" {
  const up = String(z).toUpperCase();
  if (up === "VERIFICAT" || up === "IN_AFARA_ZONEI") return up;
  return "VERIFICARE_MANUALA";
}

function normalize(a: Partial<ClaudeAnalysis>, indices: number[]): ClaudeAnalysis {
  const objects: AnalysisObject[] = (a.objects ?? [])
    .filter((o) => indices.includes(o.objectIndex))
    .map((o) => ({
      objectIndex: o.objectIndex,
      overallStatus: o.overallStatus ?? "AMBER",
      extractedFields: (o.extractedFields ?? []).map((f) => ({
        fieldName: String(f.fieldName),
        value: f.value ?? null,
        isActualized: typeof f.isActualized === "boolean" ? f.isActualized : null,
      })),
      flags: (o.flags ?? []).map((f) => ({
        code: String(f.code),
        severity: coerceSeverity(f.severity),
        zone: coerceZone(f.zone),
        titleRo: String(f.titleRo ?? f.code),
        descriptionRo: f.descriptionRo ?? null,
        legalRef: f.legalRef ?? null,
      })),
    }));
  return {
    objects,
    escalations: a.escalations ?? [],
    summary:
      a.summary ?? {
        overallStatus: "AMBER",
        verifiedCount: 0,
        manualReviewCount: 0,
        outOfScopeCount: 0,
      },
  };
}

function mediaTypeOf(mime: string): "image/jpeg" | "image/png" | null {
  if (mime === "image/jpeg" || mime === "image/jpg") return "image/jpeg";
  if (mime === "image/png") return "image/png";
  return null;
}

async function fileToBlock(doc: DocInput): Promise<Anthropic.ContentBlockParam | null> {
  let data: string;
  try {
    if (/^https?:\/\//.test(doc.fileUrl)) {
      // Vercel Blob (или иной внешний URL) — забираем байты по сети.
      const res = await fetch(doc.fileUrl);
      if (!res.ok) return null;
      data = Buffer.from(await res.arrayBuffer()).toString("base64");
    } else {
      // Legacy: локально сохранённый файл в public/uploads.
      const abs = path.join(process.cwd(), "public", doc.fileUrl.replace(/^\//, ""));
      data = (await readFile(abs)).toString("base64");
    }
  } catch {
    return null;
  }
  if (doc.mimeType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
    } as Anthropic.ContentBlockParam;
  }
  const mt = mediaTypeOf(doc.mimeType);
  if (mt) return { type: "image", source: { type: "base64", media_type: mt, data } };
  return null;
}

// Главная функция: анализирует документы (один вызов на всю транзакцию; для SCHIMB — оба объекта).
// Реальный вызов Claude при заданном ANTHROPIC_API_KEY, иначе stub. Логика stub-fallback без изменений.
export async function analyzeDocuments(
  objects: { objectIndex: number; docs: DocInput[] }[],
  dealType: string,
): Promise<ClaudeAnalysis> {
  const indices = objects.map((o) => o.objectIndex);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[claude] ANTHROPIC_API_KEY nu este setat — se folosește analiza stub.");
    return stubAnalysis(indices);
  }

  try {
    const client = new Anthropic({ apiKey });
    const content: Anthropic.ContentBlockParam[] = [
      {
        type: "text",
        text:
          `Tip tranzacție (dealType): ${dealType}. Documentele de mai jos pot fi PDF-uri scanate ` +
          `(imagini) sau fotografii — citește-le prin recunoaștere optică. Analizează-le grupate pe ` +
          `obiecte și răspunde STRICT în JSON conform structurii cerute. Dacă un document este un scan ` +
          `de calitate slabă sau conține text scris de mână care nu poate fi citit cu certitudine, ` +
          `adaugă o intrare în "escalations" (reason = ce anume nu a putut fi citit) și lasă câmpurile ` +
          `respective cu value null.`,
      },
    ];
    let fileCount = 0;
    for (const obj of objects) {
      content.push({ type: "text", text: `=== Obiect ${obj.objectIndex} ===` });
      for (const doc of obj.docs) {
        const b = await fileToBlock(doc);
        if (b) {
          content.push(b);
          fileCount++;
        }
      }
    }
    if (fileCount === 0) {
      console.warn("[claude] niciun fișier lizibil — se folosește analiza stub.");
      return stubAnalysis(indices);
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: loadSystemPrompt(),
      messages: [{ role: "user", content }],
      output_config: { format: { type: "json_schema", schema: ANALYSIS_SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming);

    const textBlock = response.content.find((b) => b.type === "text");
    if (textBlock && "text" in textBlock) {
      const parsed = JSON.parse(textBlock.text) as Partial<ClaudeAnalysis>;
      return normalize(parsed, indices);
    }
    throw new Error("Răspuns Claude fără conținut text.");
  } catch (err) {
    console.error("[claude] eroare la analiză, se folosește stub:", err);
    return stubAnalysis(indices);
  }
}
