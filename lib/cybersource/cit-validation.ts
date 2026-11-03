// Первая оплата клиента (CIT) через Unified Checkout — чистые функции разбора и проверки.
// Сервер НЕ доверяет результату из браузера: из присланного JWT берёт только кандидатов в id
// транзакции, а все факты (сумма, валюта, статус, токены) перечитывает у CyberSource
// (GET /tss/v2/transactions/{id}) и сверяет с нашей записью Payment.
//
// Поля деталей транзакции — по модели TssV2TransactionsGet200Response официального SDK:
//   clientReferenceInformation.code, orderInformation.amountDetails.{totalAmount,currency},
//   applicationInformation.applications[{name,rCode}], paymentInformation.{customer,paymentInstrument}.id,
//   paymentInformation.card.{suffix,type,expirationMonth,expirationYear}, processorInformation.*.
// paymentInformation.card.prefix (BIN) намеренно НЕ читается и не сохраняется.

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);

// Payload JWT без проверки подписи — только как подсказка (id транзакции), не как источник фактов.
export function decodeJwtPayload(jwt: unknown): Record<string, unknown> | null {
  if (typeof jwt !== "string" || jwt.length > 20_000) return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const p: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return p && typeof p === "object" ? (p as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// id транзакций CyberSource — длинные числовые строки (пример из документации: 22 цифры).
// Собираем значения ключей id/transactionId из всего payload (структура результата UC v1
// в документации не описана) — до 5 кандидатов, каждый потом проверяется у CyberSource.
export function transactionIdCandidates(payload: Record<string, unknown> | null): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || out.size >= 5 || !v || typeof v !== "object") return;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if ((k === "id" || k === "transactionId") && typeof val === "string" && /^\d{16,26}$/.test(val)) out.add(val);
      else if (typeof val === "object") walk(val, depth + 1);
    }
  };
  walk(payload, 0);
  return [...out].slice(0, 5);
}

const CARD_TYPES: Record<string, string> = { "001": "Visa", "002": "Mastercard" };

export type TxnFacts = {
  id: string;
  referenceCode: string | null;
  amount: string | null;
  currency: string | null;
  outcome: "approved" | "declined" | "unknown";
  customerId: string | null;
  paymentInstrumentId: string | null;
  networkTransactionId: string | null;
  approvalCode: string | null;
  processorCode: string | null;
  cardLast4: string | null;
  cardBrand: string | null;
  expMonth: number | null;
  expYear: number | null;
};

export function transactionFactsOf(json: Record<string, unknown> | null): TxnFacts | null {
  const id = str(json?.id);
  if (!id) return null;
  const order = obj(obj(json?.orderInformation).amountDetails);
  const pay = obj(json?.paymentInformation);
  const tok = obj(json?.tokenInformation);
  const card = obj(pay.card);
  const proc = obj(json?.processorInformation);
  const apps = obj(json?.applicationInformation).applications;
  const appList = (Array.isArray(apps) ? apps : []).map(obj);
  const auth = appList.find((a) => a.name === "ics_auth");
  const authCode = str(auth?.rCode);
  const outcome = authCode === "1" ? "approved" : authCode === "0" ? "declined" : "unknown";
  const suffix = str(card.suffix);
  const type = str(card.type);
  const month = Number(card.expirationMonth);
  const year = Number(card.expirationYear);
  return {
    id,
    referenceCode: str(obj(json?.clientReferenceInformation).code),
    amount: str(order.totalAmount),
    currency: str(order.currency),
    outcome,
    customerId: str(obj(pay.customer).id) ?? str(obj(tok.customer).id),
    paymentInstrumentId: str(obj(pay.paymentInstrument).id) ?? str(obj(tok.paymentInstrument).id),
    networkTransactionId: str(proc.networkTransactionId),
    approvalCode: str(proc.approvalCode),
    processorCode: str(proc.responseCode),
    cardLast4: suffix && /^\d{4}$/.test(suffix) ? suffix : null,
    cardBrand: type ? (CARD_TYPES[type] ?? str(card.brandName) ?? type) : str(card.brandName),
    expMonth: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
    expYear: Number.isInteger(year) && year >= 2000 ? year : null,
  };
}

const cents = (v: string | null) => (v === null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100));

export type CitPaymentView = {
  userId: string | null;
  order: string;
  amount: string;
  currency: string;
  provider: string;
  initiator: string;
  status: string;
};

export type CitCheck =
  | { ok: true }
  | {
      ok: false;
      code:
        | "NOT_OWNER"
        | "WRONG_PROVIDER"
        | "ALREADY_PAID"
        | "REFERENCE_MISMATCH"
        | "AMOUNT_MISMATCH"
        | "CURRENCY_MISMATCH"
        | "DECLINED"
        | "NOT_APPROVED";
    };

// Проверка «эта транзакция CyberSource — оплата именно этого Payment этого пользователя».
export function validateCitCompletion(payment: CitPaymentView, facts: TxnFacts, userId: string): CitCheck {
  if (payment.userId !== userId) return { ok: false, code: "NOT_OWNER" };
  if (payment.provider !== "CYBERSOURCE" || payment.initiator !== "CUSTOMER") return { ok: false, code: "WRONG_PROVIDER" };
  if (payment.status === "PAID") return { ok: false, code: "ALREADY_PAID" };
  if (facts.referenceCode !== payment.order) return { ok: false, code: "REFERENCE_MISMATCH" };
  if ((facts.currency ?? "").toUpperCase() !== payment.currency.toUpperCase()) return { ok: false, code: "CURRENCY_MISMATCH" };
  const a = cents(facts.amount);
  if (a === null || a !== cents(payment.amount)) return { ok: false, code: "AMOUNT_MISMATCH" };
  if (facts.outcome === "declined") return { ok: false, code: "DECLINED" };
  if (facts.outcome !== "approved") return { ok: false, code: "NOT_APPROVED" };
  return { ok: true };
}
