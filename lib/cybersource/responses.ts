// Разбор ответов CyberSource в типизированный исход. Чистые функции (без сети/БД) — под тесты.
//
// Формы ответов (REST, pts/v2):
//   201 { id, status, processorInformation{ responseCode, approvalCode, networkTransactionId },
//         errorInformation{ reason, message }, reconciliationId, … }  — в т.ч. DECLINED;
//   400 { status: "INVALID_REQUEST", reason, message, details[] };
//   401/403 — ошибка аутентификации/доступа;   502 { status: "SERVER_ERROR", … }.
import type { CsResponse } from "@/lib/cybersource/client";

export type CsOutcome =
  // Операция выполнена (авторизация/списание/void/refund/…).
  | { kind: "approved"; requestId: string | null; status: string; details: CsDetails }
  // Принято, но требует ручной проверки (частичная авторизация, ревью Decision Manager).
  | { kind: "review"; requestId: string | null; status: string; details: CsDetails }
  // Отказ эмитента/процессора/антифрода — исход известен, деньги не списаны.
  | { kind: "declined"; requestId: string | null; status: string; details: CsDetails }
  // Ошибка в нашем запросе (400) — повтор без исправления бесполезен.
  | { kind: "invalid"; status: string | null; reason: string | null }
  // 401/403 — ключи/доступ мерчанта.
  | { kind: "auth_error"; httpStatus: number }
  | { kind: "not_found" }
  // Исход неизвестен (5xx, непонятный ответ) — не повторять, а сверять через search.ts.
  | { kind: "unknown"; httpStatus: number; status: string | null };

export type CsDetails = {
  reason: string | null; // errorInformation.reason
  processorCode: string | null; // processorInformation.responseCode
  approvalCode: string | null;
  networkTransactionId: string | null;
  reconciliationId: string | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function detailsOf(json: Record<string, unknown> | null): CsDetails {
  const pi = obj(json?.processorInformation);
  const ei = obj(json?.errorInformation);
  return {
    reason: str(ei.reason) ?? str(json?.reason),
    processorCode: str(pi.responseCode),
    approvalCode: str(pi.approvalCode),
    networkTransactionId: str(pi.networkTransactionId),
    reconciliationId: str(json?.reconciliationId),
  };
}

// Статусы успеха по операциям (pts/v2):
//   payments (sale/auth): AUTHORIZED; capture/refund/credit: PENDING (уйдёт в settlement);
//   voids: VOIDED; reversals: REVERSED.
export const OK_STATUSES = {
  payment: ["AUTHORIZED"],
  capture: ["PENDING"],
  refund: ["PENDING"],
  void: ["VOIDED"],
  reversal: ["REVERSED"],
} as const;

const REVIEW_STATUSES = new Set(["PARTIAL_AUTHORIZED", "AUTHORIZED_PENDING_REVIEW", "PENDING_REVIEW"]);
const DECLINED_STATUSES = new Set(["DECLINED", "AUTHORIZED_RISK_DECLINED", "PENDING_AUTHENTICATION", "INVALID_ACCOUNT"]);

export function classifyResponse(res: CsResponse, okStatuses: readonly string[]): CsOutcome {
  const status = str(res.json?.status);
  if (res.httpStatus === 401 || res.httpStatus === 403) return { kind: "auth_error", httpStatus: res.httpStatus };
  if (res.httpStatus === 404) return { kind: "not_found" };
  if (res.httpStatus === 400) return { kind: "invalid", status, reason: str(res.json?.reason) };
  if (res.httpStatus === 200 || res.httpStatus === 201) {
    const details = detailsOf(res.json);
    if (status && okStatuses.includes(status)) return { kind: "approved", requestId: res.requestId, status, details };
    if (status && REVIEW_STATUSES.has(status)) return { kind: "review", requestId: res.requestId, status, details };
    if (status && DECLINED_STATUSES.has(status)) return { kind: "declined", requestId: res.requestId, status, details };
  }
  // 5xx (SERVER_ERROR), 2xx без понятного статуса и всё прочее — исход неизвестен.
  return { kind: "unknown", httpStatus: res.httpStatus, status };
}

// Безопасное отображение карты из ответа TMS: только последние 4 цифры, бренд, срок.
const CARD_TYPES: Record<string, string> = { "001": "Visa", "002": "Mastercard" };

export type CardSummary = {
  last4: string | null;
  brand: string | null;
  expMonth: number | null;
  expYear: number | null;
  state: string | null;
};

export function cardSummaryOf(json: Record<string, unknown> | null): CardSummary {
  const card = obj(json?.card);
  const masked = str(obj(obj(obj(json?._embedded).instrumentIdentifier).card).number);
  const tail = masked?.slice(-4) ?? null;
  const month = Number(card.expirationMonth);
  const year = Number(card.expirationYear);
  const type = str(card.type);
  return {
    last4: tail && /^\d{4}$/.test(tail) ? tail : null,
    brand: type ? (CARD_TYPES[type] ?? type) : null,
    expMonth: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
    expYear: Number.isInteger(year) && year >= 2000 ? year : null,
    state: str(json?.state),
  };
}

// Итог поиска транзакций (tss/v2/searches → _embedded.transactionSummaries[]).
export type SearchSummary = {
  id: string;
  submitTimeUtc: string | null;
  applications: { name: string | null; rCode: string | null; rFlag: string | null; reasonCode: string | null }[];
};

export function searchSummariesOf(json: Record<string, unknown> | null): SearchSummary[] {
  const list = obj(json?._embedded).transactionSummaries;
  if (!Array.isArray(list)) return [];
  return list.flatMap((t) => {
    const o = obj(t);
    const id = str(o.id);
    if (!id) return [];
    const apps = obj(o.applicationInformation).applications;
    return [
      {
        id,
        submitTimeUtc: str(o.submitTimeUtc),
        applications: (Array.isArray(apps) ? apps : []).map((a) => {
          const x = obj(a);
          return { name: str(x.name), rCode: str(x.rCode) ?? (typeof x.rCode === "number" ? String(x.rCode) : null), rFlag: str(x.rFlag), reasonCode: str(x.reasonCode) ?? (typeof x.reasonCode === "number" ? String(x.reasonCode) : null) };
        }),
      },
    ];
  });
}

// Вердикт сверки по найденным транзакциям: авторизация (ics_auth) с rCode=1 → прошла;
// rCode=0 → отказ; ничего не найдено → not_found; иначе — неизвестно (повторить сверку позже).
export function reconcileVerdict(summaries: SearchSummary[]): {
  verdict: "approved" | "declined" | "not_found" | "unknown";
  transactionId: string | null;
} {
  if (summaries.length === 0) return { verdict: "not_found", transactionId: null };
  for (const s of summaries) {
    const auth = s.applications.find((a) => a.name === "ics_auth");
    if (auth?.rCode === "1") return { verdict: "approved", transactionId: s.id };
  }
  for (const s of summaries) {
    const auth = s.applications.find((a) => a.name === "ics_auth");
    if (auth?.rCode === "0") return { verdict: "declined", transactionId: s.id };
  }
  return { verdict: "unknown", transactionId: summaries[0].id };
}
