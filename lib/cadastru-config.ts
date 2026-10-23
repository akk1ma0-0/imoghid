// Общие для клиента и сервера настройки «Verificare imobil» (без секретов и без сети —
// модуль безопасно импортируется из клиентских компонентов).

// Поиск по адресу. MConnect GetRealEstate принимает только кадастровый номер; адресный
// разрезолвер (здание → квартира) пока моковый на несколько зданий. Пока нет реального
// адресного сервиса — выключено: принимается только кадастровый номер. Код ветки сохранён.
export const ENABLE_ADDRESS_SEARCH = false;

// Формат номера = валидатор коннектора: участок 7, здание 7.3, … до помещения 7.3.2.3
// (напр. 0100109.159.02.001). Один и тот же regex на клиенте, в роуте и в коннекторе.
export const CAD_NUMBER_RE = /^\d{7}(\.\d{3}(\.\d{2}(\.\d{3})?)?)?$/;
export const CAD_FORMAT_EXAMPLE = "0100109.159.02.001";

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
