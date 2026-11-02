// CyberSource Transaction Search — сверка платежей со статусом UNKNOWN (таймаут/5xx) без webhook.
// POST /tss/v2/searches { query: "clientReferenceInformation.code:<код>", sort, limit, … } → 201,
// результаты в _embedded.transactionSummaries[] (developer.cybersource.com, Transaction Search API).
// CyberSource предупреждает о rate limiting при частых поисках — вызывать для конкретных
// UNKNOWN-платежей, не массово.
import { csRequest, CsTransportError } from "@/lib/cybersource/client";
import { reconcileVerdict, searchSummariesOf, type SearchSummary } from "@/lib/cybersource/responses";

export type SearchResult =
  | {
      ok: true;
      summaries: SearchSummary[];
      verdict: "approved" | "declined" | "not_found" | "unknown";
      transactionId: string | null;
    }
  | { ok: false; httpStatus: number; reason: string | null };

// referenceCode — наш Payment.order (clientReferenceInformation.code при отправке).
export async function findByReferenceCode(referenceCode: string): Promise<SearchResult> {
  if (!/^[A-Za-z0-9_-]{1,50}$/.test(referenceCode)) throw new Error("Некорректный reference code");
  try {
    const res = await csRequest({
      op: "tss_search",
      method: "POST",
      path: "/tss/v2/searches",
      body: {
        save: false,
        name: "imoghid-reconcile",
        timezone: "UTC",
        query: `clientReferenceInformation.code:${referenceCode}`,
        offset: 0,
        limit: 20,
        sort: "submitTimeUtc:desc",
      },
    });
    if (res.httpStatus !== 201 && res.httpStatus !== 200) {
      const reason = typeof res.json?.reason === "string" ? res.json.reason : null;
      return { ok: false, httpStatus: res.httpStatus, reason };
    }
    const summaries = searchSummariesOf(res.json);
    return { ok: true, summaries, ...reconcileVerdict(summaries) };
  } catch (e) {
    if (e instanceof CsTransportError) return { ok: false, httpStatus: 0, reason: e.kind };
    throw e;
  }
}
