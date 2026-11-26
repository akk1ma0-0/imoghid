// Общие для клиента и сервера настройки «Verificare imobil» (без секретов и без сети —
// модуль безопасно импортируется из клиентских компонентов).

// Поиск по адресу. MConnect GetRealEstate принимает только кадастровый номер; адресный
// разрезолвер (здание → квартира) пока моковый на несколько зданий. Пока нет реального
// адресного сервиса — выключено: принимается только кадастровый номер. Код ветки сохранён.
export const ENABLE_ADDRESS_SEARCH = false;

// Формат номера = валидатор коннектора: участок 7 цифр, затем до трёх сегментов — здание (3–4),
// 2–4, 2–4 (напр. 0100109.159.02.001, 0100109.128.01.143; с 4-значным сегментом — 0100225.041.0212).
// Строка уходит в GetRealEstate как есть (без дополнения нулями). Один и тот же regex на клиенте,
// в роуте и в коннекторе (server.js: CAD_RE — docs/mconnect-connector-patch.diff).
export const CAD_NUMBER_RE = /^\d{7}(\.\d{3,4}(\.\d{2,4}(\.\d{2,4})?)?)?$/;
export const CAD_FORMAT_EXAMPLE = "0100109.159.02.001";

// ── Повторные попытки к коннектору (рекомендация AGE: умеренный темп, растущие паузы) ──
// До 2 повторов с паузами 1 с и 3 с — только при временных сбоях (TIMEOUT / UNREACHABLE / 5xx без
// кода коннектора). NOT_FOUND, INVALID_INPUT, WSSEC, UNAUTHORIZED и SOAP_FAULT с кодом не повторяем.
export const CAD_RETRY_PAUSES_MS: readonly number[] = [1000, 3000];
// Общий бюджет времени на проверку (роут: maxDuration = 30 с). Повтор делается, только если
// пауза + таймаут попытки укладываются в остаток бюджета.
export const CAD_TOTAL_BUDGET_MS = 25_000;

// Журнал проверок (CadastruCheck): срок хранения; старше — удаляет ежедневный cron.
export const CAD_CHECK_RETENTION_MONTHS = 12;

// Пустой Rights (или у Right нет части признаков) = AGE: «нет данных о правах», а НЕ «нет обременений».
export const CAD_NO_RIGHTS_DATA_TEXT =
  "Nu există date privind drepturile patrimoniale; comandați extrasul oficial";

export function normalizeCadastralNumber(s: string): string {
  return (s ?? "").replace(/\s/g, "");
}

export function isValidCadastralNumber(s: string): boolean {
  return CAD_NUMBER_RE.test(normalizeCadastralNumber(s));
}

// Исходы неудачного кадастрового вызова = коды ошибок коннектора ({ error: { code } }).
// UNAUTHORIZED — неверный CONNECTOR_AUTH_TOKEN (наша конфигурация), пользователю — как WSSEC.
export type CadErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "SOAP_FAULT"
  | "TIMEOUT"
  | "WSSEC"
  | "UNREACHABLE"
  | "UNAUTHORIZED";

export const CAD_ERROR_CODES: readonly CadErrorCode[] = [
  "INVALID_INPUT",
  "NOT_FOUND",
  "SOAP_FAULT",
  "TIMEOUT",
  "WSSEC",
  "UNREACHABLE",
  "UNAUTHORIZED",
];

export const CAD_ERROR_STATUS: Record<CadErrorCode, number> = {
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  SOAP_FAULT: 502,
  WSSEC: 503,
  UNREACHABLE: 503,
  UNAUTHORIZED: 503,
  TIMEOUT: 504,
};

// Код, который видит клиент. Причину отказа на нашей стороне (WS-Security, токен
// коннектора) наружу не раскрываем — обе дают общий «UNAVAILABLE».
export const CAD_PUBLIC_CODE: Record<CadErrorCode, string> = {
  INVALID_INPUT: "INVALID_INPUT",
  NOT_FOUND: "NOT_FOUND",
  SOAP_FAULT: "SOAP_FAULT",
  TIMEOUT: "TIMEOUT",
  WSSEC: "UNAVAILABLE",
  UNREACHABLE: "UNREACHABLE",
  UNAUTHORIZED: "UNAVAILABLE",
};

const UNAVAILABLE_TEXT = {
  title: "Serviciu indisponibil",
  text: "Serviciul cadastral este temporar indisponibil.",
};

export const CAD_ERROR_TEXT: Record<CadErrorCode, { title: string; text: string }> = {
  INVALID_INPUT: {
    title: "Număr cadastral invalid",
    text: `Numărul cadastral nu are un format valid. Exemplu: ${CAD_FORMAT_EXAMPLE}.`,
  },
  NOT_FOUND: {
    title: "Obiectul nu a fost găsit",
    text: "Obiectul cu acest număr cadastral nu a fost găsit în registru. Verificați numărul sau consultați e-Cadastru.",
  },
  SOAP_FAULT: {
    title: "Eroare a registrului",
    text: "Registrul a returnat o eroare. Încercați din nou mai târziu sau consultați e-Cadastru.",
  },
  TIMEOUT: {
    title: "Registrul nu a răspuns",
    text: "Registrul nu a răspuns la timp. Încercați din nou peste câteva minute.",
  },
  WSSEC: UNAVAILABLE_TEXT,
  UNAUTHORIZED: UNAVAILABLE_TEXT,
  UNREACHABLE: {
    title: "Serviciu indisponibil",
    text: "Serviciul cadastral este temporar indisponibil. Încercați din nou mai târziu sau deschideți e-Cadastru manual.",
  },
};
