// Проверка соединения с CyberSource без платежа: два безвредных аутентифицированных вызова.
//   POST /tss/v2/searches (поиск по несуществующему коду) — проверяет подпись с digest; ожидаем 201.
//   GET  /tms/v2/customers/<несуществующий id>             — проверяет подпись без digest; ожидаем 404.
// 401/403 на любом из них = ключи/доступ не в порядке. Значения ключей наружу не попадают.
import { csConfig, CsConfigError, csRequest, CsTransportError } from "@/lib/cybersource/client";

export type CsHealth = {
  ok: boolean;
  env: string | null;
  post: { http: number; reason: string | null }; // http 0 — сеть/таймаут
  get: { http: number; reason: string | null };
  error?: string; // только для отсутствующей конфигурации (имена переменных)
};

async function probe(args: Parameters<typeof csRequest>[0]) {
  try {
    const res = await csRequest(args);
    const reason =
      typeof res.json?.reason === "string" ? res.json.reason : typeof res.json?.status === "string" ? res.json.status : null;
    return { http: res.httpStatus, reason };
  } catch (e) {
    if (e instanceof CsTransportError) return { http: 0, reason: e.kind };
    throw e;
  }
}

export async function csHealthCheck(): Promise<CsHealth> {
  let env: string;
  try {
    env = csConfig().env;
  } catch (e) {
    if (e instanceof CsConfigError) {
      return { ok: false, env: null, post: { http: 0, reason: null }, get: { http: 0, reason: null }, error: e.message };
    }
    throw e;
  }
  const post = await probe({
    op: "health_search",
    method: "POST",
    path: "/tss/v2/searches",
    body: {
      save: false,
      name: "imoghid-health",
      timezone: "UTC",
      query: "clientReferenceInformation.code:imoghid-healthcheck",
      offset: 0,
      limit: 1,
      sort: "submitTimeUtc:desc",
    },
  });
  const get = await probe({ op: "health_tms_get", method: "GET", path: "/tms/v2/customers/0000000000000000000000000000000A" });
  const authOk = ![401, 403, 0].includes(post.http) && ![401, 403, 0].includes(get.http);
  return { ok: authOk && post.http >= 200 && post.http < 300, env, post, get };
}
