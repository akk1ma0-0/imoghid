// CyberSource TMS (Token Management Service): чтение и удаление сохранённых токенов карты.
// Эндпоинты (developer.cybersource.com, TMS ctv):
//   GET    /tms/v2/customers/{customerId}/payment-instruments/{paymentInstrumentId}
//   DELETE /tms/v2/customers/{customerId}/payment-instruments/{paymentInstrumentId}  → 204
//   DELETE /tms/v2/customers/{customerId}                                             → 204
// Наружу отдаём только последние 4 цифры, бренд и срок карты — номер (даже маскированный) не храним.
import { csRequest, CsTransportError, safePathId } from "@/lib/cybersource/client";
import { cardSummaryOf, type CardSummary } from "@/lib/cybersource/responses";

export type TmsResult =
  | { ok: true; alreadyGone: boolean }
  | { ok: false; httpStatus: number; reason: string | null }; // httpStatus 0 — сеть/таймаут

async function del(op: string, path: string): Promise<TmsResult> {
  try {
    const res = await csRequest({ op, method: "DELETE", path });
    if (res.httpStatus === 204 || res.httpStatus === 200) return { ok: true, alreadyGone: false };
    if (res.httpStatus === 404) return { ok: true, alreadyGone: true }; // токена уже нет — цель достигнута
    const reason = typeof res.json?.reason === "string" ? res.json.reason : null;
    return { ok: false, httpStatus: res.httpStatus, reason };
  } catch (e) {
    if (e instanceof CsTransportError) return { ok: false, httpStatus: 0, reason: e.kind };
    throw e;
  }
}

// Удаление customer (вместе с его платёжными инструментами) — при отмене подписки / удалении аккаунта.
export function deleteCustomer(customerId: string): Promise<TmsResult> {
  return del("tms_delete_customer", `/tms/v2/customers/${safePathId(customerId)}`);
}

// Удаление одного инструмента. Дефолтный инструмент customer с несколькими картами
// TMS не даст удалить без смены дефолта — вернётся ok:false с кодом и причиной.
export function deletePaymentInstrument(customerId: string, paymentInstrumentId: string): Promise<TmsResult> {
  return del(
    "tms_delete_payment_instrument",
    `/tms/v2/customers/${safePathId(customerId)}/payment-instruments/${safePathId(paymentInstrumentId)}`,
  );
}

export type InstrumentResult =
  | { ok: true; card: CardSummary }
  | { ok: false; httpStatus: number; reason: string | null };

export async function getPaymentInstrument(customerId: string, paymentInstrumentId: string): Promise<InstrumentResult> {
  try {
    const res = await csRequest({
      op: "tms_get_payment_instrument",
      method: "GET",
      path: `/tms/v2/customers/${safePathId(customerId)}/payment-instruments/${safePathId(paymentInstrumentId)}`,
    });
    if (res.httpStatus === 200) return { ok: true, card: cardSummaryOf(res.json) };
    const reason = typeof res.json?.reason === "string" ? res.json.reason : null;
    return { ok: false, httpStatus: res.httpStatus, reason };
  } catch (e) {
    if (e instanceof CsTransportError) return { ok: false, httpStatus: 0, reason: e.kind };
    throw e;
  }
}
