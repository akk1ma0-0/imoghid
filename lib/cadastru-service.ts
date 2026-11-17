// Поиск в кадастре (Verificare imobil).
//
// Извлечение записи по кадастровому номеру (lookupCadastru) идёт через VPS-коннектор
// MConnect (SOAP GetRealEstate за VPN к STISC; коннектор отвечает mode "live" | "mock").
// CallingUser коннектор берёт из своих настроек (IDNP представителя организации) —
// приложение его не передаёт. Разрешение адрес → здание/квартира (picker) НЕ покрывается методом
// GetRealEstate (он принимает кадастровый номер), поэтому этот слой моковый
// (CAD_BUILDINGS / CAD_ADDR_INDEX) и выключен флагом ENABLE_ADDRESS_SEARCH.
//
// Два шага намеренно разделены, чтобы между ними роут мог зарезервировать лимит:
//   resolveCadastruQuery(query) — без сети: номер / picker / ошибка ввода;
//   lookupCadastru(cad)         — сеть: запись или типизированная ошибка (не бросает).

import {
  CAD_ERROR_CODES,
  CAD_NUMBER_RE,
  CAD_RETRY_PAUSES_MS,
  CAD_TOTAL_BUDGET_MS,
  ENABLE_ADDRESS_SEARCH,
  normalizeCadastralNumber,
  type CadErrorCode,
} from "@/lib/cadastru-config";

// Флаги: "Există" | "Nu există" | "Nu s-a putut verifica" (третье = неизвестно, ≠ «нет»).
export type CadRecord = {
  addr: string;
  supr: string;
  suprM2?: number | null; // площадь числом (из "87.90 m.p."); null — не распознана
  dest: string;
  val: string;
  prop: string;
  dr: string; // Alte drepturi reale
  not: string; // Notări
  int: string; // Interdicții
  titulari?: string | null; // агрегат по правообладателям (без персональных данных)
  // true — в ответе нет данных о правах (Rights пуст/отсутствует либо у Right нет части признаков).
  // По AGE это «нет данных о правах», а НЕ «нет обременений»: карточка показывает отдельный блок.
  rightsNoData?: boolean;
};

export type CadSource = "live" | "mock";

export type TraceStep = { s: "ok" | "run" | "wait"; title: string; val?: string; step?: string };

export type CadBuilding = { bcad: string; addr: string; teren: string; apts: number[] };

export type CadResolveResult =
  | { kind: "cad"; cad: string; trace: TraceStep[] }
  | { kind: "picker"; building: CadBuilding; note: string; trace: TraceStep[] }
  | { kind: "error"; code: CadErrorCode; title?: string; text?: string };

// attempts — сколько обращений к коннектору сделано (1 + повторы).
export type CadLookupResult =
  | { ok: true; cadastralNo: string; record: CadRecord; source: CadSource; attempts: number }
  | { ok: false; code: CadErrorCode; attempts: number };

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
// Признак: true / false; null или отсутствие = коннектор не получил элемент (данных нет).
type ConnectorRight = {
  HasInterdictions?: boolean | null;
  HasNotations?: boolean | null;
  HasOtherRights?: boolean | null;
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

type ConnectorSuccess = { mode?: string; data?: ConnectorRealEstate | null };
type ConnectorError = { error?: { code?: unknown } };

type FetchOutcome =
  | { ok: true; data: ConnectorRealEstate; source: CadSource }
  | { ok: false; code: CadErrorCode; retryable: boolean };

const isCadErrorCode = (v: unknown): v is CadErrorCode =>
  typeof v === "string" && (CAD_ERROR_CODES as readonly string[]).includes(v);

// Запасная классификация, если тело ошибки без известного error.code (прокси, nginx и т.п.).
function codeFromHttpStatus(status: number): CadErrorCode {
  if (status === 400) return "INVALID_INPUT";
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  if (status === 404) return "NOT_FOUND";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status === 503) return "UNREACHABLE";
  return "SOAP_FAULT";
}

// Временный сбой, который имеет смысл повторить: TIMEOUT / UNREACHABLE (от коннектора), сетевой
// отказ до коннектора, 5xx без распознаваемого кода (прокси/nginx). Всё остальное — окончательно:
// NOT_FOUND («Nu există date»), INVALID_INPUT, WSSEC, UNAUTHORIZED, SOAP_FAULT с кодом.
function isRetryableFailure(code: CadErrorCode, knownCode: boolean, httpStatus: number): boolean {
  if (knownCode) return code === "TIMEOUT" || code === "UNREACHABLE";
  return httpStatus >= 500;
}

// Один запрос к коннектору. Не бросает: любой исход → типизированный результат.
// Ошибка классифицируется по { error: { code } } коннектора, при его отсутствии — по HTTP-статусу.
async function fetchRealEstate(cad: string, requestId: string, timeoutMs: number): Promise<FetchOutcome> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(connectorUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.CONNECTOR_AUTH_TOKEN ?? ""}`,
        },
        // callingUser НЕ передаём — коннектор берёт его из своих настроек.
        body: JSON.stringify({ cadastralNumber: cad, requestId }),
        signal: ctrl.signal,
        cache: "no-store",
      });
    } catch {
      // Таймаут — наш abort; иначе сеть/DNS/TLS/отказ соединения до коннектора.
      return { ok: false, code: ctrl.signal.aborted ? "TIMEOUT" : "UNREACHABLE", retryable: true };
    }

    let json: (ConnectorSuccess & ConnectorError) | null;
    try {
      json = await res.json();
    } catch {
      // Тело не JSON (или оборвалось по нашему таймауту).
      if (ctrl.signal.aborted) return { ok: false, code: "TIMEOUT", retryable: true };
      json = null;
    }

    if (!res.ok) {
      const raw = json?.error?.code;
      const known = isCadErrorCode(raw);
      const code = known ? raw : codeFromHttpStatus(res.status);
      return { ok: false, code, retryable: isRetryableFailure(code, known, res.status) };
    }
    // 200 без записи — нарушение контракта (NOT_FOUND приходит 404-м) → ошибка реестра, без повтора.
    if (!json?.data?.CadastralNumber) return { ok: false, code: "SOAP_FAULT", retryable: false };
    return { ok: true, data: json.data, source: json.mode === "live" ? "live" : "mock" };
  } finally {
    clearTimeout(timer);
  }
}

// "87.90 m.p." → 87.9. Только квадратные метры (m.p. / mp / m² / m2 / без единицы);
// иное (ha, мусор) → null, тогда в карточке остаётся исходная строка.
export function parseAreaM2(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*(m\.?\s*p\.?|mp|m²|m2|m\.?\s*pătra[țt]i)?$/i);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Свод по правообладателям: только их число и доли — без имён/IDNP. Доля проходит, только если
// похожа на долю (1/2, 0.5, 50%); иначе — «nespecificată» (на случай неожиданного содержимого).
function summarizeHolders(rights: ConnectorRight[] | undefined): string | null {
  if (!Array.isArray(rights) || rights.length < 2) return null;
  const quotas = rights.map((r) => {
    const q = typeof r?.Quota === "string" ? r.Quota.trim() : "";
    return /^[\d\s/.,%]{1,15}$/.test(q) ? q.replace(/\s+/g, "") : "nespecificată";
  });
  return `${rights.length} titulari de drepturi, cote: ${quotas.join(", ")}`;
}

const RIGHT_KEYS = ["HasInterdictions", "HasNotations", "HasOtherRights"] as const;

// AGE: если элемент Rights есть, но без Right — это «нет данных о правах», а не «нет обременений».
// Так же трактуем Right, в котором нет какого-то из трёх признаков (новый коннектор отдаёт null;
// старый превращал отсутствие в false — для него различить нельзя, см. патч коннектора).
export function rightsHaveNoData(rights: ConnectorRight[] | undefined): boolean {
  if (!Array.isArray(rights) || rights.length === 0) return true;
  return rights.some((r) => RIGHT_KEYS.some((k) => typeof r?.[k] !== "boolean"));
}

// Свод одного булева признака по всем Right: есть хоть одно true → «există»; все записи
// явно false → «nu există»; иначе (признак не пришёл / Rights пуст) → неизвестно (≠ «нет»).
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
export function mapRealEstate(d: ConnectorRealEstate): CadRecord {
  const a = d.Address ?? {};
  const addr =
    [
      [a.Street, a.House].filter(Boolean).join(" "),
      a.Block ? `bl. ${a.Block}` : "",
      a.Flat ? `ap. ${a.Flat}` : "",
      a.Zone,
      a.Locality,
    ]
      .filter(Boolean)
      .join(", ") || d.CadastralNumber;
  const suprM2 = parseAreaM2(d.Area);
  const rightsNoData = rightsHaveNoData(d.Rights);
  // Нет данных о правах → «Nu există» не выводим ни по одному пункту (иначе выглядит как «нет обременений»);
  // «Există» (явное true) сохраняем — это предупреждение, его скрывать нельзя.
  const flag = (k: (typeof RIGHT_KEYS)[number]) => {
    const f = aggregateRightFlag(d.Rights, k);
    return rightsNoData && f === FLAG_NONE ? FLAG_UNKNOWN : f;
  };
  return {
    addr,
    supr: suprM2 !== null ? `${suprM2} m²` : d.Area || "—",
    suprM2,
    dest: d.Enjoyment || d.Type || "—",
    val: "—", // nu este în structura GetRealEstate
    prop: "—", // nu este în structura GetRealEstate
    dr: flag("HasOtherRights"),
    not: flag("HasNotations"),
    int: flag("HasInterdictions"),
    titulari: summarizeHolders(d.Rights),
    rightsNoData,
  };
}

// Тонкая подстановка для тестов (паузы и часы).
export type LookupOpts = {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  pausesMs?: readonly number[];
  budgetMs?: number;
};

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Сетевой шаг: запись по кадастровому номеру. Не бросает.
// Формат проверяется ещё раз (defense in depth) — невалидный номер в сеть не уходит.
// Повторы: до len(pausesMs) раз, только при временных сбоях и пока пауза + таймаут попытки
// укладываются в бюджет. requestId повторов — `<id>`, `<id>-2`, `<id>-3` (проходит RID_RE коннектора),
// так в логе коннектора одна проверка читается как одна цепочка.
export async function lookupCadastru(
  rawCad: string,
  requestId: string,
  opts: LookupOpts = {},
): Promise<CadLookupResult> {
  const cad = normalizeCadastralNumber(rawCad);
  if (!CAD_NUMBER_RE.test(cad)) return { ok: false, code: "INVALID_INPUT", attempts: 0 };
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? Date.now;
  const pauses = opts.pausesMs ?? CAD_RETRY_PAUSES_MS;
  const budget = opts.budgetMs ?? CAD_TOTAL_BUDGET_MS;
  const started = now();
  let attempt = 0;
  try {
    for (;;) {
      attempt++;
      const timeout = connectorTimeoutMs();
      const rid = attempt === 1 ? requestId : `${requestId}-${attempt}`;
      const r = await fetchRealEstate(cad, rid, timeout);
      if (r.ok) {
        return { ok: true, cadastralNo: cad, record: mapRealEstate(r.data), source: r.source, attempts: attempt };
      }
      const pause = pauses[attempt - 1];
      if (!r.retryable || pause === undefined || now() - started + pause + timeout > budget) {
        return { ok: false, code: r.code, attempts: attempt };
      }
      await sleep(pause);
    }
  } catch {
    // Неожиданное исключение (например, в маппинге) — не глотаем молча, а типизируем.
    return { ok: false, code: "SOAP_FAULT", attempts: Math.max(attempt, 1) };
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
  if (!clean) return { kind: "error", code: "INVALID_INPUT" };

  // Кадастровый номер (участок/здание/помещение) → напрямую в коннектор.
  const asCad = normalizeCadastralNumber(clean);
  if (CAD_NUMBER_RE.test(asCad)) {
    return {
      kind: "cad",
      cad: asCad,
      trace: [
        { s: "ok", title: "Număr cadastral", val: asCad },
        { s: "ok", title: "Înregistrare extrasă", val: asCad },
      ],
    };
  }

  if (!addressSearch) return { kind: "error", code: "INVALID_INPUT" };

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
