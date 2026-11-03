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

// Unified Checkout создаёт под одним reference code НЕСКОЛЬКО транзакций: настройка и проверка
// 3-D Secure (ics_pa_setup, ics_pa_enroll) и саму оплату (ics_auth + ics_bill, плюс создание
// токена ics_pay_subscription_create). Оплата — только транзакция с ics_auth или ics_bill;
// у 3DS-транзакций нет суммы, валюты и токенов (проверено на тестовой среде).
const PAYMENT_APPS = new Set(["ics_auth", "ics_bill"]);

export function hasPaymentApplication(appNames: (string | null)[]): boolean {
  return appNames.some((n) => n !== null && PAYMENT_APPS.has(n));
}

// id транзакций ОПЛАТЫ из результатов поиска (search.ts) — 3DS-транзакции отбрасываются.
export function paymentTransactionIds(summaries: { id: string; applications: { name: string | null }[] }[]): string[] {
  return summaries.filter((s) => hasPaymentApplication(s.applications.map((a) => a.name))).map((s) => s.id);
}

// Имена ключей payload JWT (пути до глубины 4) — БЕЗ значений, для диагностики структуры
// результата Unified Checkout. Массивы обозначаются «[]» (смотрим только первый элемент).
export function jwtKeyPaths(payload: Record<string, unknown> | null, maxPaths = 80): string[] {
  const out: string[] = [];
  const walk = (v: unknown, path: string, depth: number) => {
    if (out.length >= maxPaths) return;
    if (Array.isArray(v)) {
      out.push(`${path}[]`);
      if (depth < 4 && v.length) walk(v[0], `${path}[]`, depth + 1);
      return;
    }
    if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        const p = path ? `${path}.${k}` : k;
        if (val && typeof val === "object" && depth < 4) walk(val, p, depth + 1);
        else out.push(p);
        if (out.length >= maxPaths) return;
      }
    }
  };
  walk(payload, "", 0);
  return out;
}

export type TxnFacts = {
  id: string;
  isPayment: boolean; // есть ics_auth или ics_bill (не 3DS-транзакция)
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
  // rCode: 1 — успех, 0 — отказ, -1 — ошибка. Отказ — только при заполненном rCode ≠ 1;
  // нет ics_auth или rCode — исход ещё не известен.
  const outcome = authCode === "1" ? "approved" : authCode !== null ? "declined" : "unknown";
  const suffix = str(card.suffix);
  const type = str(card.type);
  const month = Number(card.expirationMonth);
  const year = Number(card.expirationYear);
  return {
    id,
    isPayment: hasPaymentApplication(appList.map((a) => str(a.name))),
    referenceCode: str(obj(json?.clientReferenceInformation).code),
    // У нулевой авторизации (проверка карты) сумма может прийти только как authorizedAmount.
    amount: str(order.totalAmount) ?? str(order.authorizedAmount),
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
        | "NOT_READY"; // не транзакция оплаты / поля ещё не заполнены → UNKNOWN и повтор
    };

// Коды, после которых платёж становится FAILED (окончательно). Всё остальное — не окончательно.
export const CIT_FINAL_FAILURES = new Set(["REFERENCE_MISMATCH", "AMOUNT_MISMATCH", "CURRENCY_MISMATCH", "DECLINED"]);

// Проверка «эта транзакция CyberSource — оплата именно этого Payment этого пользователя».
// FAILED окончательный, поэтому несоответствие — только для ЗАПОЛНЕННЫХ и отличающихся полей;
// отсутствие поля, 3DS-транзакция или незавершённый статус → NOT_READY (повторить позже).
export function validateCitCompletion(payment: CitPaymentView, facts: TxnFacts, userId: string): CitCheck {
  if (payment.userId !== userId) return { ok: false, code: "NOT_OWNER" };
  if (payment.provider !== "CYBERSOURCE" || payment.initiator !== "CUSTOMER") return { ok: false, code: "WRONG_PROVIDER" };
  if (payment.status === "PAID") return { ok: false, code: "ALREADY_PAID" };
  if (!facts.isPayment) return { ok: false, code: "NOT_READY" };
  if (facts.referenceCode === null) return { ok: false, code: "NOT_READY" };
  if (facts.referenceCode !== payment.order) return { ok: false, code: "REFERENCE_MISMATCH" };
  if (facts.outcome === "declined") return { ok: false, code: "DECLINED" };
  if (facts.currency === null) return { ok: false, code: "NOT_READY" };
  if (facts.currency.toUpperCase() !== payment.currency.toUpperCase()) return { ok: false, code: "CURRENCY_MISMATCH" };
  const a = cents(facts.amount);
  if (a === null) return { ok: false, code: "NOT_READY" };
  if (a !== cents(payment.amount)) return { ok: false, code: "AMOUNT_MISMATCH" };
  if (facts.outcome !== "approved") return { ok: false, code: "NOT_READY" };
  return { ok: true };
}

// ── Смена карты: проверка карты на 0.00 (Account Verification) через Unified Checkout ──
// Те же строгие правила, что у первой оплаты: FAILED — только явный отказ ics_auth или
// заполненные, но другие reference / валюта / сумма (≠ 0); всё прочее — NOT_READY (повтор).
// Токены новой карты обязательны: без них карта не может заменить старую → NOT_READY.
export type CardVerificationView = CitPaymentView & { purpose: string };

export function validateCardVerification(payment: CardVerificationView, facts: TxnFacts, userId: string): CitCheck {
  if (payment.userId !== userId) return { ok: false, code: "NOT_OWNER" };
  if (payment.provider !== "CYBERSOURCE" || payment.initiator !== "CUSTOMER" || payment.purpose !== "CARD_VERIFICATION") {
    return { ok: false, code: "WRONG_PROVIDER" };
  }
  if (payment.status === "PAID") return { ok: false, code: "ALREADY_PAID" };
  if (!facts.isPayment) return { ok: false, code: "NOT_READY" };
  if (facts.referenceCode === null) return { ok: false, code: "NOT_READY" };
  if (facts.referenceCode !== payment.order) return { ok: false, code: "REFERENCE_MISMATCH" };
  if (facts.outcome === "declined") return { ok: false, code: "DECLINED" };
  if (facts.currency === null) return { ok: false, code: "NOT_READY" };
  if (facts.currency.toUpperCase() !== payment.currency.toUpperCase()) return { ok: false, code: "CURRENCY_MISMATCH" };
  const a = cents(facts.amount);
  if (a === null) return { ok: false, code: "NOT_READY" };
  if (a !== 0) return { ok: false, code: "AMOUNT_MISMATCH" };
  if (facts.outcome !== "approved") return { ok: false, code: "NOT_READY" };
  if (!facts.customerId || !facts.paymentInstrumentId) return { ok: false, code: "NOT_READY" };
  return { ok: true };
}
