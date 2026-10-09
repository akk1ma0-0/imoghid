// Общие для клиента и сервера настройки «Verificare imobil» (без секретов и без сети —
// модуль безопасно импортируется из клиентских компонентов).

// Поиск по адресу. MConnect GetRealEstate принимает только кадастровый номер; адресный
// разрезолвер (здание → квартира) пока моковый на несколько зданий. Пока нет реального
// адресного сервиса — выключено: принимается только кадастровый номер. Код ветки сохранён.
export const ENABLE_ADDRESS_SEARCH = false;

// Полный кадастровый номер помещения: 7.3.2.3 цифр (напр. 0100109.159.02.001).
// TODO(AGE): уточнить, принимает ли GetRealEstate номера участка (7.3) и здания (7.3.2).
export const CAD_FULL_RE = /^\d{7}\.\d{3}\.\d{2}\.\d{3}$/;
export const CAD_FORMAT_EXAMPLE = "0100109.159.02.001";

export function normalizeCadastralNumber(s: string): string {
  return (s ?? "").replace(/\s/g, "");
}

export function isValidCadastralNumber(s: string): boolean {
  return CAD_FULL_RE.test(normalizeCadastralNumber(s));
}

// Типизированные исходы неудачного кадастрового вызова. Коды ошибок самого коннектора
// (SOAP Fault / WS-Security) сюда не входят — они появятся с реальным SOAP-клиентом.
export type CadErrorCode = "INVALID_FORMAT" | "NOT_FOUND" | "UPSTREAM_ERROR" | "TIMEOUT" | "UNREACHABLE";

export const CAD_ERROR_STATUS: Record<CadErrorCode, number> = {
  INVALID_FORMAT: 400,
  NOT_FOUND: 404,
  UPSTREAM_ERROR: 502,
  UNREACHABLE: 503,
  TIMEOUT: 504,
};

export const CAD_ERROR_TEXT: Record<CadErrorCode, { title: string; text: string }> = {
  INVALID_FORMAT: {
    title: "Număr cadastral invalid",
    text: `Numărul cadastral nu are un format valid. Exemplu: ${CAD_FORMAT_EXAMPLE}.`,
  },
  NOT_FOUND: {
    title: "Obiectul nu a fost găsit",
    text: "Obiectul cu acest număr cadastral nu a fost găsit în registru. Verificați numărul sau consultați e-Cadastru.",
  },
  UPSTREAM_ERROR: {
    title: "Eroare a registrului",
    text: "Registrul a returnat o eroare. Încercați din nou mai târziu sau consultați e-Cadastru.",
  },
  TIMEOUT: {
    title: "Registrul nu a răspuns",
    text: "Registrul nu a răspuns la timp. Încercați din nou peste câteva minute.",
  },
  UNREACHABLE: {
    title: "Serviciul cadastral este temporar indisponibil",
    text: "Încercați din nou mai târziu sau deschideți e-Cadastru manual.",
  },
};
