import type { FlagSeverity, FlagZone } from "@prisma/client";
import type { ExtractedFields } from "@/lib/analyze/types";

export type FlagInput = {
  objectIndex: number;
  code: string;
  severity: FlagSeverity;
  zone: FlagZone;
  titleRo: string;
  descriptionRo: string;
};

// Имя «актуализировано» если записано полностью в CAPSLOCK (без строчных букв).
export function isAllUppercaseName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  return trimmed === trimmed.toLocaleUpperCase("ro-RO") && /\p{L}/u.test(trimmed);
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function norm(s: string | null | undefined): string {
  return stripDiacritics((s ?? "").toLowerCase());
}

// Имущество получено по наследству → личная собственность, согласие супруга НЕ требуется
// (Cod civil RM, art. 371 alin. 1 lit. b). Определяем по «temeiul dreptului» (legal_basis).
export function isInheritanceBasis(legalBasis: string | null | undefined): boolean {
  return /mosten|succesiun|testament/.test(norm(legalBasis));
}

function parseArea(s: string | null): number | null {
  if (!s) return null;
  const cleaned = s.replace(",", ".").replace(/[^\d.]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Презентация флага в UI по коду (FlagSeverity не хранит ORANGE — задаём цвет здесь).
export function flagPresentation(code: string): {
  color: "red" | "amber" | "orange" | "green" | "blue";
} {
  switch (code) {
    case "AREA_MISMATCH":
      return { color: "red" };
    case "LEGAL_ENTITY_SELLER":
      return { color: "orange" };
    case "NO_ENCUMBRANCE":
      return { color: "green" };
    default:
      return { color: "amber" };
  }
}

// Детерминированный движок флагов по извлечённым полям одного объекта.
export function generateFlags(
  fields: ExtractedFields,
  objectIndex: number,
): FlagInput[] {
  const out: FlagInput[] = [];

  // AREA_MISMATCH (red) — площади из акта и выписки не совпадают.
  const a1 = parseArea(fields.area_act);
  const a2 = parseArea(fields.area_extras);
  if (a1 !== null && a2 !== null && Math.abs(a1 - a2) > 0.05) {
    out.push({
      objectIndex,
      code: "AREA_MISMATCH",
      severity: "RED",
      zone: "VERIFICARE_MANUALA",
      titleRo: `Discrepanță de suprafață: ${fields.area_extras} ↔ ${fields.area_act} m²`,
      descriptionRo:
        "Datele din extras și actul de drept nu coincid. Necesită clarificare înainte de notar.",
    });
  }

  // NOT_ACTUALIZED (amber) — хотя бы один собственник записан с инициалами.
  const stale = fields.owner_names.filter((n) => !isAllUppercaseName(n));
  if (stale.length > 0) {
    out.push({
      objectIndex,
      code: "NOT_ACTUALIZED",
      severity: "AMBER",
      zone: "VERIFICARE_MANUALA",
      titleRo: `Date neactualizate: ${stale.join(", ")}`,
      descriptionRo:
        "Înregistrarea conține inițiale în loc de numele complet. Este necesară actualizarea în Cadastru înainte de tranzacție.",
    });
  }

  // PRIVATIZARE_CERT (amber) — temeiul conține vânzare-cumpărare / transmitere-primire.
  const lb = norm(fields.legal_basis);
  if (lb.includes("vanzare-cumparare") || lb.includes("transmitere-primire")) {
    out.push({
      objectIndex,
      code: "PRIVATIZARE_CERT",
      severity: "AMBER",
      zone: "VERIFICARE_MANUALA",
      titleRo:
        "Verificați existența certificatului privind participanții la privatizare",
      descriptionRo:
        "Temeiul dreptului — Contract de vânzare-cumpărare / transmitere-primire. Este necesar să verificați existența certificatului privind participanții la privatizare.",
    });
  }

  // LEGAL_ENTITY_SELLER («orange», хранится как AMBER) — собственник юр. лицо.
  if (fields.seller_is_legal_entity) {
    out.push({
      objectIndex,
      code: "LEGAL_ENTITY_SELLER",
      severity: "AMBER",
      zone: "VERIFICARE_MANUALA",
      titleRo: "Vânzător — persoană juridică",
      descriptionRo:
        "Sunt necesare: hotărârea fondatorilor și verificarea împuternicirilor reprezentantului.",
    });
  }

  // NO_ENCUMBRANCE (green) — обременений не выявлено.
  const enc = norm(fields.encumbrances);
  if (!enc || enc.includes("nu au fost identificate") || enc.includes("absente")) {
    out.push({
      objectIndex,
      code: "NO_ENCUMBRANCE",
      severity: "GREEN",
      zone: "VERIFICAT",
      titleRo:
        objectIndex === 1
          ? "Interdicții/grevări neidentificate"
          : `Interdicții/grevări neidentificate — Obiect ${objectIndex}`,
      descriptionRo:
        "Conform extras: sechestre, ipotecă, uzufruct — absente. Reverificați înainte de notar.",
    });
  }

  return out;
}
