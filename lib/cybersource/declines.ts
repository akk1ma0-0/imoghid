// Классификация отказа автосписания (MIT) — чистая функция.
//
// Источники:
//   errorInformation.reason — список значений из модели ответа платежа официального SDK
//     (PtsV2PaymentsPost201ResponseErrorInformation: EXPIRED_CARD, STOLEN_LOST_CARD, INSUFFICIENT_FUND, …);
//   смысл и «можно ли повторять» — «Reason Codes for the Simple Order API» (developer.cybersource.com):
//     202 expired, 205 lost/stolen, 231 invalid account, 208 not authorized, 221 frozen — не повторять;
//     207 issuer unavailable, 236 processor failure — «wait a few minutes and resend»;
//   processorInformation.merchantAdvice.code — Merchant Advice Code сети (модель SDK
//     PtsV2PaymentsPost201ResponseProcessorInformationMerchantAdvice): Visa 1 «never approve»,
//     Mastercard 03/21/99 «do not try again», 01 «new account information» — повтор запрещён/бесполезен;
//     Visa 2, Mastercard 02 и 24–30 — «retry later».
// Правила сетей приоритетнее reason: «не повторять» от MAC делает отказ жёстким.

export type DeclineClass =
  | "hard" // карта недействительна/заблокирована/нужен клиент — без повторов, «actualizați cardul»
  | "soft" // нет средств, лимит, временный сбой — повторы +1/+3/+5 дней
  | "config"; // проблема на нашей стороне/настроек — без писем клиенту, сигнал админу

const HARD = new Set([
  "EXPIRED_CARD",
  "STOLEN_LOST_CARD",
  "INVALID_ACCOUNT",
  "UNAUTHORIZED_CARD",
  "SUSPENDED_ACCOUNT",
  "BLOCKED_BY_CARDHOLDER",
  "BLACKLISTED_CUSTOMER",
  "PAYMENT_REFUSED",
  "CVN_NOT_MATCH",
  "INVALID_CVN",
  "CV_FAILED",
  "CONSUMER_AUTHENTICATION_REQUIRED", // эмитент требует 3DS — без клиента не пройти
  "CONSUMER_AUTHENTICATION_FAILED",
  "ALLOWABLE_PIN_RETRIES_EXCEEDED",
  "CUSTOMER_WATCHLIST_MATCH",
  "ADDRESS_COUNTRY_WATCHLIST_MATCH",
  "EMAIL_COUNTRY_WATCHLIST_MATCH",
  "IP_COUNTRY_WATCHLIST_MATCH",
  "DECISION_PROFILE_REJECT",
  "SCORE_EXCEEDS_THRESHOLD",
  "DAGGREJECTED",
  "DAGGDENIED",
  "DSYSREJECTED",
]);

const CONFIG = new Set(["INVALID_MERCHANT_CONFIGURATION", "AVS_FAILED"]);

// Остальное (INSUFFICIENT_FUND, EXCEEDS_CREDIT_LIMIT, ISSUER_UNAVAILABLE, PROCESSOR_ERROR,
// CONTACT_PROCESSOR, GENERAL_DECLINE, PROCESSOR_DECLINED, …) и неизвестные значения — мягкие.
const MAC_HARD = new Set(["1", "01", "03", "21", "99"]);

export function classifyDecline(args: { reason: string | null; merchantAdviceCode?: string | null }): DeclineClass {
  const reason = (args.reason ?? "").toUpperCase();
  if (CONFIG.has(reason)) return "config";
  if (HARD.has(reason)) return "hard";
  const mac = (args.merchantAdviceCode ?? "").trim();
  if (mac && MAC_HARD.has(mac)) return "hard";
  return "soft";
}
