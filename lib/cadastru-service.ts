// Поиск в кадастре (Verificare imobil).
//
// Извлечение записи по кадастровому номеру (lookupCadastru) идёт через VPS-коннектор
// MConnect (SOAP GetRealEstate за VPN к STISC; сейчас коннектор может отвечать моком той же
// структуры). Разрешение адрес → здание/квартира (picker) НЕ покрывается методом
// GetRealEstate (он принимает кадастровый номер), поэтому этот слой моковый
// (CAD_BUILDINGS / CAD_ADDR_INDEX) и выключен флагом ENABLE_ADDRESS_SEARCH.
//
// Два шага намеренно разделены, чтобы между ними роут мог зарезервировать лимит:
//   resolveCadastruQuery(query) — без сети: номер / picker / ошибка ввода;
//   lookupCadastru(cad)         — сеть: запись или типизированная ошибка (не бросает).

import {
  CAD_FULL_RE,
  ENABLE_ADDRESS_SEARCH,
  normalizeCadastralNumber,
  type CadErrorCode,
} from "@/lib/cadastru-config";

// Флаги: "Există" | "Nu există" | "Nu s-a putut verifica" (третье = неизвестно, ≠ «нет»).
export type CadRecord = {
  addr: string;
  supr: string;
  dest: string;
  val: string;
  prop: string;
  dr: string; // Alte drepturi reale
  not: string; // Notări
  int: string; // Interdicții
};

export type TraceStep = { s: "ok" | "run" | "wait"; title: string; val?: string; step?: string };

export type CadBuilding = { bcad: string; addr: string; teren: string; apts: number[] };

export type CadResolveResult =
  | { kind: "cad"; cad: string; trace: TraceStep[] }
  | { kind: "picker"; building: CadBuilding; note: string; trace: TraceStep[] }
  | { kind: "error"; code: CadErrorCode; title?: string; text?: string };

export type CadLookupResult =
  | { ok: true; cadastralNo: string; record: CadRecord }
  | { ok: false; code: CadErrorCode };

export const FLAG_EXISTS = "Există";
export const FLAG_NONE = "Nu există";
export const FLAG_UNKNOWN = "Nu s-a putut verifica";

// ── Коннектор MConnect (GetRealEstate) ──
// Читаем env при вызове (а не при загрузке модуля) — так конфиг можно менять в тестах.
const connectorUrl = () =>
  process.env.CONNECTOR_URL || "https://connector.imoghid.md/get-real-estate";
const connectorTimeoutMs = () => Number(process.env.CONNECTOR_TIMEOUT_MS) || 10_000;

// Структура ответа коннектора = RealEstate из WSDL (Anexa tehnică nr.1).
type ConnectorAddress = {
  Region?: string | null;
  Locality?: string | null;
  Zone?: string | null;
  Street?: string | null;
  House?: string | null;
  Block?: string | null;
  Flat?: string | null;
};
type ConnectorRight = {
  HasInterdictions?: boolean;
  HasNotations?: boolean;
  HasOtherRights?: boolean;
  Quota?: string;
};
type ConnectorRealEstate = {
  CadastralNumber: string;
  Type?: string;
  Enjoyment?: string;
  Area?: string;
  Address?: ConnectorAddress;
  Rights?: ConnectorRight[];
};

type FetchOutcome = { ok: true; data: ConnectorRealEstate } | { ok: false; code: CadErrorCode };

// Запрос к коннектору. Не бросает: любой исход → типизированный результат.
// Классификация только по транспорту/HTTP-статусу; разбор кодов ошибок коннектора — позже.
async function fetchRealEstate(cad: string): Promise<FetchOutcome> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), connectorTimeoutMs());
  try {
    let res: Response;
    try {
      res = await fetch(connectorUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.CONNECTOR_AUTH_TOKEN ?? ""}`,
        },
        body: JSON.stringify({ cadastralNumber: cad }),
        signal: ctrl.signal,
        cache: "no-store",
      });
    } catch {
      // Таймаут — наш abort; иначе сеть/DNS/отказ соединения до коннектора.
      return { ok: false, code: ctrl.signal.aborted ? "TIMEOUT" : "UNREACHABLE" };
    }

    if (res.status === 404) return { ok: false, code: "NOT_FOUND" };
    if (res.status === 408 || res.status === 504) return { ok: false, code: "TIMEOUT" };
    if (res.status === 503) return { ok: false, code: "UNREACHABLE" };
    if (!res.ok) return { ok: false, code: "UPSTREAM_ERROR" };

    let json: { data?: ConnectorRealEstate | null };
    try {
      json = await res.json();
    } catch {
      return { ok: false, code: ctrl.signal.aborted ? "TIMEOUT" : "UPSTREAM_ERROR" };
    }
    // Пустой ответ (нет записи) = объект не найден.
    if (!json?.data?.CadastralNumber) return { ok: false, code: "NOT_FOUND" };
    return { ok: true, data: json.data };
  } finally {
    clearTimeout(timer);
  }
}

// Свод одного булева признака по всем Right: есть хоть одно true → «există»; все записи
// явно false → «nu există»; иначе (поле не пришло / Rights пуст) → неизвестно.
// Пустой Rights считаем неизвестным, а не «чисто»: TODO(AGE) — подтвердить семантику.
function aggregateRightFlag(
  rights: ConnectorRight[] | undefined,
  key: "HasInterdictions" | "HasNotations" | "HasOtherRights",
): string {
  if (!Array.isArray(rights) || rights.length === 0) return FLAG_UNKNOWN;
  if (rights.some((r) => r?.[key] === true)) return FLAG_EXISTS;
  if (rights.every((r) => r?.[key] === false)) return FLAG_NONE;
  return FLAG_UNKNOWN;
}

// Маппинг RealEstate → CadRecord (модель отображения).
// «valoare estimată» и «tip proprietate» в структуре GetRealEstate отсутствуют → «—»
// (в UI для результатов MConnect эти поля скрыты).
function mapRealEstate(d: ConnectorRealEstate): CadRecord {
  const a = d.Address ?? {};
  const addr =
    [
      [a.Street, a.House].filter(Boolean).join(" "),
      a.Block ? `bl. ${a.Block}` : "",
      a.Flat ? `ap. ${a.Flat}` : "",
      a.Zone,
    ]
      .filter(Boolean)
      .join(", ") || d.CadastralNumber;
  return {
    addr,
    supr: d.Area ? `${d.Area} m²` : "—",
    dest: d.Enjoyment || d.Type || "—",
    val: "—", // nu este în structura GetRealEstate
    prop: "—", // nu este în structura GetRealEstate
    dr: aggregateRightFlag(d.Rights, "HasOtherRights"),
    not: aggregateRightFlag(d.Rights, "HasNotations"),
    int: aggregateRightFlag(d.Rights, "HasInterdictions"),
  };
}

// Сетевой шаг: запись по полному кадастровому номеру. Не бросает.
// Формат проверяется ещё раз (defense in depth) — невалидный номер в сеть не уходит.
export async function lookupCadastru(rawCad: string): Promise<CadLookupResult> {
  const cad = normalizeCadastralNumber(rawCad);
  if (!CAD_FULL_RE.test(cad)) return { ok: false, code: "INVALID_FORMAT" };
  try {
    const r = await fetchRealEstate(cad);
    if (!r.ok) return r;
    return { ok: true, cadastralNo: cad, record: mapRealEstate(r.data) };
  } catch {
    // Неожиданное исключение (например, в маппинге) — не глотаем молча, а типизируем.
    return { ok: false, code: "UPSTREAM_ERROR" };
  }
}

// ── Адресный разрезолвер (моковый, за ENABLE_ADDRESS_SEARCH) ──

const cadRange = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

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

// Шаг без сети: что делать с введённым запросом. Picker и ошибки ввода ничего не стоят —
// лимит резервируется только когда есть конкретный номер для запроса в кадастр.
export function resolveCadastruQuery(
  query: string,
  opts: { addressSearch?: boolean } = {},
): CadResolveResult {
  const addressSearch = opts.addressSearch ?? ENABLE_ADDRESS_SEARCH;
  const clean = (query ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return { kind: "error", code: "INVALID_FORMAT" };

  // Полный кадастровый номер → напрямую в коннектор.
  const asCad = normalizeCadastralNumber(clean);
  if (CAD_FULL_RE.test(asCad)) {
    return {
      kind: "cad",
      cad: asCad,
      trace: [
        { s: "ok", title: "Număr cadastral", val: asCad },
        { s: "ok", title: "Înregistrare extrasă", val: asCad },
      ],
    };
  }

  if (!addressSearch) return { kind: "error", code: "INVALID_FORMAT" };

  // Адрес (разрешение адрес → здание/квартира — моковое, не покрывается GetRealEstate)
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
      kind: "error",
      code: "NOT_FOUND",
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
        kind: "picker",
        building,
        note: `Apartamentul ${apt} nu a fost găsit în clădirea ${b.addr}. Selectați din listă:`,
        trace: [...baseTrace, { s: "wait", step: "!", title: `Apartamentul ${apt} nu a fost găsit în această clădire` }],
      };
    }
    const cad = `${bcad}.${pad3(apt)}`;
    return {
      kind: "cad",
      cad,
      trace: [
        ...baseTrace,
        { s: "ok", title: "Apartament", val: "ap." + apt },
        { s: "ok", title: "Înregistrare extrasă", val: cad },
      ],
    };
  }

  return {
    kind: "picker",
    building,
    note: `Clădirea ${b.addr} conține ${b.apts.length} apartamente. Selectați-l pe cel necesar:`,
    trace: [...baseTrace, { s: "wait", step: "!", title: "Selectați apartamentul (nu se presupune)" }],
  };
}
