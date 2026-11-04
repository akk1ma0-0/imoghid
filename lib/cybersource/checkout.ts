// CyberSource Unified Checkout (v1): capture context и чтение деталей транзакции.
//
// Capture context — POST /uc/v1/sessions (Sessions API, Unified Checkout v1; прежний
// /up/v1/capture-contexts относится к v0 и требует clientVersion). Ответ — подписанный JWT
// (Accept: application/jwt), в нём clientLibrary + clientLibraryIntegrity для загрузки JS.
// Проверено на тестовой среде: MDL, 3DS и создание токенов TMS принимаются.
//
// Поля (developer.cybersource.com, Unified Checkout → Sessions API / Capture Context):
//   targetOrigins (https, без wildcard), allowedCardNetworks, allowedPaymentTypes, country, locale,
//   captureMandate.*, completeMandate.{type, decisionManager, consumerAuthentication, tms{tokenCreate,tokenTypes}},
//   data.orderInformation.amountDetails.{totalAmount,currency}, data.clientReferenceInformation.code.
//   clientVersion не передаём — сервер выбирает актуальную совместимую версию (рекомендация документации).
import { csRequest, CsTransportError, safePathId } from "@/lib/cybersource/client";
import { transactionFactsOf, type TxnFacts } from "@/lib/cybersource/cit-validation";
import { buildTargetOrigins, extraExplicitOrigins } from "@/lib/cybersource/target-origins";

// targetOrigin страницы оплаты. Unified Checkout принимает ровно один origin на сессию (с двумя
// форма падает с UNUSED_TARGET_ORIGINS), поэтому массив содержит один элемент. Preview: origin
// текущей ветки (VERCEL_BRANCH_URL), иначе первый из CS_UC_TARGET_ORIGINS; production и локально —
// первый из CS_UC_TARGET_ORIGINS. Правила — target-origins.ts.
export function ucTargetOrigins(): string[] {
  const env = {
    explicit: process.env.CS_UC_TARGET_ORIGINS,
    vercelEnv: process.env.VERCEL_ENV,
    branchUrl: process.env.VERCEL_BRANCH_URL,
  };
  const origins = buildTargetOrigins(env);
  const extra = extraExplicitOrigins(env);
  if (extra.length > 0) {
    // Только хосты: в списке лишние origin'ы игнорируются, используется первый.
    console.warn(JSON.stringify({ evt: "cs_uc_target_origins", warn: "MULTIPLE_ORIGINS_USING_FIRST", used: origins[0] ?? null, ignored: extra }));
  }
  return origins;
}

export type CaptureContextResult =
  | { ok: true; captureContext: string; clientLibrary: string; clientLibraryIntegrity: string }
  | { ok: false; httpStatus: number; reason: string | null };

export async function createCaptureContext(args: {
  amount: string; // "300.00"
  currency: string;
  referenceCode: string; // = Payment.order → clientReferenceInformation.code транзакции
  // CAPTURE — первая оплата (продажа). AUTH — проверка карты на 0.00 (Account Verification):
  // нулевую авторизацию нельзя capture (Payments Developer Guide, Zero Amount Authorizations).
  type?: "CAPTURE" | "AUTH";
}): Promise<CaptureContextResult> {
  const targetOrigins = ucTargetOrigins();
  if (targetOrigins.length === 0) return { ok: false, httpStatus: 0, reason: "CS_UC_TARGET_ORIGINS not set" };
  try {
    const res = await csRequest({
      op: "uc_session",
      method: "POST",
      path: "/uc/v1/sessions",
      body: {
        targetOrigins,
        allowedCardNetworks: ["VISA", "MASTERCARD"],
        allowedPaymentTypes: ["PANENTRY"], // только ввод карты: токен для автосписания и 3DS
        country: "MD",
        locale: "ro_RO",
        captureMandate: {
          billingType: "NONE", // адрес не собираем — не нужен для услуги
          requestEmail: false,
          requestPhone: false,
          requestShipping: false,
          showAcceptedNetworkIcons: true,
        },
        completeMandate: {
          type: args.type ?? "CAPTURE", // продажа (по умолчанию) или только авторизация
          decisionManager: false,
          consumerAuthentication: "3DS",
          tms: { tokenCreate: true, tokenTypes: ["customer", "paymentInstrument"] },
        },
        data: {
          orderInformation: { amountDetails: { totalAmount: args.amount, currency: args.currency } },
          clientReferenceInformation: { code: args.referenceCode },
        },
      },
    });
    const jwt = res.text.trim();
    if ((res.httpStatus === 200 || res.httpStatus === 201) && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(jwt)) {
      const lib = clientLibraryOf(jwt);
      if (!lib) return { ok: false, httpStatus: res.httpStatus, reason: "NO_CLIENT_LIBRARY" };
      return { ok: true, captureContext: jwt, ...lib };
    }
    const reason = typeof res.json?.reason === "string" ? res.json.reason : null;
    return { ok: false, httpStatus: res.httpStatus, reason };
  } catch (e) {
    if (e instanceof CsTransportError) return { ok: false, httpStatus: 0, reason: e.kind };
    throw e;
  }
}

// URL библиотеки и SRI-хеш — из самого capture context (их нельзя хардкодить: меняются).
// Разрешаем только хосты CyberSource по https.
function clientLibraryOf(jwt: string): { clientLibrary: string; clientLibraryIntegrity: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")) as {
      ctx?: { data?: { clientLibrary?: unknown; clientLibraryIntegrity?: unknown } }[];
    };
    const d = payload.ctx?.[0]?.data;
    const url = typeof d?.clientLibrary === "string" ? d.clientLibrary : "";
    const integrity = typeof d?.clientLibraryIntegrity === "string" ? d.clientLibraryIntegrity : "";
    const host = new URL(url).hostname;
    if (!url.startsWith("https://") || !/(^|\.)cybersource\.com$/.test(host) || !integrity) return null;
    return { clientLibrary: url, clientLibraryIntegrity: integrity };
  } catch {
    return null;
  }
}

export type DetailsResult =
  | { ok: true; facts: TxnFacts }
  | { ok: false; httpStatus: number; reason: string | null }; // 404 — нет/ещё не проиндексирована

// Детали транзакции — авторитетный источник сумм, статуса и токенов (GET /tss/v2/transactions/{id}).
export async function getTransactionDetails(transactionId: string): Promise<DetailsResult> {
  try {
    const res = await csRequest({ op: "tss_details", method: "GET", path: `/tss/v2/transactions/${safePathId(transactionId)}` });
    if (res.httpStatus === 200) {
      const facts = transactionFactsOf(res.json);
      return facts ? { ok: true, facts } : { ok: false, httpStatus: 200, reason: "UNPARSEABLE" };
    }
    const reason = typeof res.json?.reason === "string" ? res.json.reason : null;
    return { ok: false, httpStatus: res.httpStatus, reason };
  } catch (e) {
    if (e instanceof CsTransportError) return { ok: false, httpStatus: 0, reason: e.kind };
    throw e;
  }
}
