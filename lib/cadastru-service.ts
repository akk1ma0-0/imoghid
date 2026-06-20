// Поиск в кадастре (Verificare cadastru). Сейчас — моковые данные (как модуль 999).
// Единственная точка подключения реального API (ASP / Acces-Web e-Cadastru):
// заменяется ТОЛЬКО lookupCadastru() / getRecordByCad(); API-роут и UI не трогаются.
// Логика воспроизведена из docs/imoghid-v4.html (#viewCadastru).

export type CadRecord = {
  addr: string;
  supr: string;
  dest: string;
  val: string;
  prop: string;
  dr: string; // Alte drepturi reale: "Există" | "Nu există"
  not: string; // Notări
  int: string; // Interdicții
};

export type TraceStep = { s: "ok" | "run" | "wait"; title: string; val?: string; step?: string };

export type CadLookupResult =
  | { status: "record"; cadastralNo: string; record: CadRecord; trace: TraceStep[] }
  | {
      status: "picker";
      building: { bcad: string; addr: string; teren: string; apts: number[] };
      note: string;
      trace: TraceStep[];
    }
  | { status: "fallback"; title: string; text: string };

const cadRange = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

const CAD_RECORDS: Record<string, CadRecord> = {
  "0100110.477.05.040": {
    addr: "bd. Decebal 99/D, ap.40, Botanica",
    supr: "89.80 m²",
    dest: "Locativă",
    val: "605 563 lei",
    prop: "Privată",
    dr: "Există",
    not: "Nu există",
    int: "Există",
  },
  "0100109.159.02.032": {
    addr: "str. Cetatea Albă 143/1, ap.32, Botanica",
    supr: "66.80 m²",
    dest: "Locativă",
    val: "344 020 lei",
    prop: "Privată",
    dr: "Există",
    not: "Nu există",
    int: "Există",
  },
};

const CAD_BUILDINGS: Record<string, { addr: string; teren: string; apts: number[] }> = {
  "0100109.159.02": { addr: "str. Cetatea Albă 143/1", teren: "0100109.159", apts: cadRange(60) },
  "0100109.159.01": { addr: "str. Cetatea Albă 143/3", teren: "0100109.159", apts: cadRange(30) },
  "0100109.159.03": { addr: "str. Cetatea Albă 143/2", teren: "0100109.159", apts: cadRange(39) },
  "0100110.477.05": { addr: "bd. Decebal 99/D", teren: "0100110.477", apts: cadRange(60) },
};

const CAD_ADDR_INDEX: Record<string, string> = {
  "cetatea alba 143/1": "0100109.159.02",
  "cetatea alba 143/3": "0100109.159.01",
  "cetatea alba 143/2": "0100109.159.03",
  "decebal 99/d": "0100110.477.05",
};

const CAD_FULL_RE = /^\d{7}\.\d{3}\.\d{2}\.\d{3}$/;

function cadNorm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ăâ]/g, "a")
    .replace(/î/g, "i")
    .replace(/[șş]/g, "s")
    .replace(/[țţ]/g, "t")
    .replace(/\b(str|strada|bd|bulevardul|sect|sector|mun|municipiul)\.?/g, " ")
    .replace(/chisinau|botanica/g, " ")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function cadExtractApt(s: string): number | null {
  const m = s.match(/(?:ap\.?|apartament)\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}
const pad3 = (n: number) => String(n).padStart(3, "0");

function cadSynth(cad: string, bcad: string | null, apt: number): CadRecord {
  const b = bcad ? CAD_BUILDINGS[bcad] : null;
  const supr = (45 + ((apt * 37) % 45)).toFixed(2);
  const flag = apt % 3 === 0;
  return {
    addr: (b ? `${b.addr}, ap.${apt}` : cad) + " (demo)",
    supr: supr + " m²",
    dest: "Locativă",
    val: (300000 + apt * 4137).toLocaleString("ro-RO") + " lei",
    prop: "Privată",
    dr: flag ? "Există" : "Nu există",
    not: "Nu există",
    int: flag ? "Există" : "Nu există",
  };
}

// Извлечение записи по полному кадастровому номеру (демо: словарь или синтез).
export function getRecordByCad(cad: string): CadRecord {
  const parts = cad.split(".");
  const bcad = parts.slice(0, 3).join(".");
  const apt = parseInt(parts[3] ?? "0", 10);
  return CAD_RECORDS[cad] ?? cadSynth(cad, CAD_BUILDINGS[bcad] ? bcad : null, apt);
}

// Главный поиск: точный номер → запись; адрес → запись/picker/fallback.
export function lookupCadastru(query: string): CadLookupResult {
  const clean = (query ?? "").trim().replace(/\s+/g, " ");
  if (!clean) {
    return { status: "fallback", title: "Introduceți date", text: "Adresa sau numărul cadastral este gol." };
  }

  // Полный кадастровый номер
  if (CAD_FULL_RE.test(clean.replace(/\s/g, ""))) {
    const cad = clean.replace(/\s/g, "");
    return {
      status: "record",
      cadastralNo: cad,
      record: getRecordByCad(cad),
      trace: [
        { s: "ok", title: "Număr cadastral", val: cad },
        { s: "ok", title: "Înregistrare extrasă", val: cad },
      ],
    };
  }

  // Адрес
  const apt = cadExtractApt(clean);
  const key = cadNorm(clean.replace(/(?:ap\.?|apartament)\s*\d+/i, ""));
  let bcad = CAD_ADDR_INDEX[key];
  if (!bcad) {
    for (const k in CAD_ADDR_INDEX) {
      if (key.includes(k)) {
        bcad = CAD_ADDR_INDEX[k];
        break;
      }
    }
  }
  if (!bcad) {
    return {
      status: "fallback",
      title: "Adresa nu a fost găsită.",
      text: "Verificați formatul străzii/numărului sau deschideți portalul manual.",
    };
  }

  const b = CAD_BUILDINGS[bcad];
  const baseTrace: TraceStep[] = [
    { s: "ok", title: "Adresă recunoscută" },
    { s: "ok", title: "Teren", val: b.teren },
    { s: "ok", title: "Clădire", val: `${b.addr} → ${bcad}` },
  ];
  const building = { bcad, addr: b.addr, teren: b.teren, apts: b.apts };

  if (apt) {
    if (!b.apts.includes(apt)) {
      return {
        status: "picker",
        building,
        note: `Apartamentul ${apt} nu a fost găsit în clădirea ${b.addr}. Selectați din listă:`,
        trace: [...baseTrace, { s: "wait", step: "!", title: `Apartamentul ${apt} nu a fost găsit în această clădire` }],
      };
    }
    const cad = `${bcad}.${pad3(apt)}`;
    return {
      status: "record",
      cadastralNo: cad,
      record: getRecordByCad(cad),
      trace: [
        ...baseTrace,
        { s: "ok", title: "Apartament", val: "ap." + apt },
        { s: "ok", title: "Înregistrare extrasă", val: cad },
      ],
    };
  }

  return {
    status: "picker",
    building,
    note: `Clădirea ${b.addr} conține ${b.apts.length} apartamente. Selectați-l pe cel necesar:`,
    trace: [...baseTrace, { s: "wait", step: "!", title: "Selectați apartamentul (nu se presupune)" }],
  };
}
