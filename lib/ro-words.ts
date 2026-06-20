// Чистые хелперы (без node-импортов) — используются и на сервере, и на клиенте.

const RO_UNITS = [
  "", "unu", "doi", "trei", "patru", "cinci", "șase", "șapte", "opt", "nouă",
  "zece", "unsprezece", "doisprezece", "treisprezece", "paisprezece", "cincisprezece",
  "șaisprezece", "șaptesprezece", "optsprezece", "nouăsprezece",
];
const RO_TENS = [
  "", "", "douăzeci", "treizeci", "patruzeci", "cincizeci",
  "șaizeci", "șaptezeci", "optzeci", "nouăzeci",
];

// Число прописью на румынском (с диакритиками). "" для <=0/NaN.
export function numToRoWords(input: number | string): string {
  const n = typeof input === "string" ? parseInt(input, 10) : Math.floor(input);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 20) return RO_UNITS[n];
  if (n < 100) {
    const t = RO_TENS[Math.floor(n / 10)];
    const u = RO_UNITS[n % 10];
    return u ? `${t} și ${u}` : t;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    const hStr = h === 1 ? "o sută" : h === 2 ? "două sute" : `${RO_UNITS[h]} sute`;
    return rest ? `${hStr} ${numToRoWords(rest)}` : hStr;
  }
  if (n < 1000000) {
    const th = Math.floor(n / 1000);
    const rest = n % 1000;
    const thStr = th === 1 ? "o mie" : th === 2 ? "două mii" : `${numToRoWords(th)} mii`;
    return rest ? `${thStr} ${numToRoWords(rest)}` : thStr;
  }
  if (n < 1000000000) {
    const m = Math.floor(n / 1000000);
    const rest = n % 1000000;
    const mStr = m === 1 ? "un milion" : `${numToRoWords(m)} milioane`;
    return rest ? `${mStr} ${numToRoWords(rest)}` : mStr;
  }
  return String(n);
}

export const RO_MONTHS = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];

// ISO (YYYY-MM-DD) → "DD.MM.YYYY". Пусто, если дата не задана/невалидна.
export function formatDateRo(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

// ISO → { zi:"DD", luna:"<lună text>", an:"<2 cifre>" } для contract_zi/luna/an.
export function splitDateRo(iso: string | null | undefined): { zi: string; luna: string; an: string } {
  if (!iso) return { zi: "", luna: "", an: "" };
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return { zi: "", luna: "", an: "" };
  const monthIdx = parseInt(m[2], 10) - 1;
  return {
    zi: m[3],
    luna: RO_MONTHS[monthIdx] ?? "",
    an: m[1], // полный год (4 цифры) — в шаблоне больше нет жёсткого «20»
  };
}
