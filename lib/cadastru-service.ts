// Поиск в кадастре (Verificare imobil).
//
// Извлечение записи по кадастровому номеру (getRecordByCad) идёт через VPS-коннектор
// MConnect (SOAP GetRealEstate за VPN к STISC; сейчас коннектор отвечает моком той же
// структуры). Разрешение адрес → здание/квартира (picker) НЕ покрывается методом
// GetRealEstate (он принимает кадастровый номер), поэтому этот слой остаётся моковым
// (CAD_BUILDINGS / CAD_ADDR_INDEX) до появления реального сервиса адресного поиска.
// API-роут и UI не трогаются; контракт (CadRecord / CadLookupResult) сохранён.

export type CadRecord = {
  addr: string;
  supr: string;
  dest: string;
  val: string;
  prop: string;
  dr: string; // Alte drepturi reale: "Există" | "Nu există" | "Nu s-a putut verifica"
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

// ── Коннектор MConnect (GetRealEstate) ──
const CONNECTOR_URL =
  process.env.CONNECTOR_URL || "https://connector.imoghid.md/get-real-estate";
const CONNECTOR_TIMEOUT_MS = 10_000;

// Структура ответа коннектора = RealEstate из Anexa tehnică nr.1.
type ConnectorAddress = {
  Region: string;
  Locality: string;
  Zone: string;
  Street: string;
  House: string;
  Block: string;
  Flat: string;
};
type ConnectorRealEstate = {
  CadastralNumber: string;
  Type: string;
  Enjoyment: string;
  Area: string;
  Address: ConnectorAddress;
  Rights: { HasInterdictions: boolean; Quota: string }[];
};

// Запрос к коннектору по кадастровому номеру. Бросает при сетевой ошибке/таймауте/не-2xx.
async function fetchRealEstate(cad: string): Promise<ConnectorRealEstate> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONNECTOR_TIMEOUT_MS);
  try {
    const res = await fetch(CONNECTOR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CONNECTOR_AUTH_TOKEN ?? ""}`,
      },
      body: JSON.stringify({ cadastralNumber: cad }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`connector responded ${res.status}`);
    const json = (await res.json()) as { data?: ConnectorRealEstate };
    if (!json?.data?.CadastralNumber) throw new Error("connector: invalid payload");
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

// Маппинг RealEstate → CadRecord (модель отображения).
// Известный зазор: GetRealEstate отдаёт только Interdicții (Rights[].HasInterdictions).
// «Alte drepturi reale» и «Notări» структурой не покрыты → помечаем как непроверенные
// автоматически (UI рендерит «Nu s-a putut verifica» жёлтым = требует ручной проверки).
// «valoare estimată» и «forma de proprietate» также отсутствуют в структуре GetRealEstate.
function mapRealEstate(d: ConnectorRealEstate): CadRecord {
  const a = d.Address ?? ({} as ConnectorAddress);
  const addr =
    [
      [a.Street, a.House].filter(Boolean).join(" "),
      a.Block ? `bl. ${a.Block}` : "",
      a.Flat ? `ap. ${a.Flat}` : "",
      a.Zone,
    ]
      .filter(Boolean)
      .join(", ") || d.CadastralNumber;
  const hasInterdictions = Array.isArray(d.Rights) && d.Rights.some((r) => r.HasInterdictions);
  return {
    addr,
    supr: d.Area ? `${d.Area} m²` : "—",
    dest: d.Enjoyment || d.Type || "—",
    val: "—", // nu este în structura GetRealEstate
    prop: "—", // nu este în structura GetRealEstate
    dr: "Nu s-a putut verifica", // necesită verificare manuală (nu e în răspuns)
    not: "Nu s-a putut verifica", // necesită verificare manuală (nu e în răspuns)
    int: hasInterdictions ? "Există" : "Nu există",
  };
}

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

// Извлечение записи по полному кадастровому номеру через коннектор MConnect.
export async function getRecordByCad(cad: string): Promise<CadRecord> {
  const data = await fetchRealEstate(cad);
  return mapRealEstate(data);
}

// Fallback при недоступности коннектора (сеть/таймаут/ошибка сервиса).
function connectorFallback(cad: string): CadLookupResult {
  return {
    status: "fallback",
    title: "Serviciul cadastral este temporar indisponibil",
    text: `Nu am putut obține datele pentru ${cad} de la registrul cadastral. Încercați din nou mai târziu sau deschideți portalul e-Cadastru manual.`,
  };
}

// Главный поиск: точный номер → запись (коннектор); адрес → запись/picker/fallback.
export async function lookupCadastru(query: string): Promise<CadLookupResult> {
  const clean = (query ?? "").trim().replace(/\s+/g, " ");
  if (!clean) {
    return { status: "fallback", title: "Introduceți date", text: "Adresa sau numărul cadastral este gol." };
  }

  // Полный кадастровый номер → напрямую в коннектор.
  if (CAD_FULL_RE.test(clean.replace(/\s/g, ""))) {
    const cad = clean.replace(/\s/g, "");
    try {
      const record = await getRecordByCad(cad);
      return {
        status: "record",
        cadastralNo: cad,
        record,
        trace: [
          { s: "ok", title: "Număr cadastral", val: cad },
          { s: "ok", title: "Înregistrare extrasă", val: cad },
        ],
      };
    } catch {
      return connectorFallback(cad);
    }
  }

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
    try {
      const record = await getRecordByCad(cad);
      return {
        status: "record",
        cadastralNo: cad,
        record,
        trace: [
          ...baseTrace,
          { s: "ok", title: "Apartament", val: "ap." + apt },
          { s: "ok", title: "Înregistrare extrasă", val: cad },
        ],
      };
    } catch {
      return connectorFallback(cad);
    }
  }

  return {
    status: "picker",
    building,
    note: `Clădirea ${b.addr} conține ${b.apts.length} apartamente. Selectați-l pe cel necesar:`,
    trace: [...baseTrace, { s: "wait", step: "!", title: "Selectați apartamentul (nu se presupune)" }],
  };
}
