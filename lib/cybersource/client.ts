// CyberSource (Visa Acceptance Platform) — REST-клиент с HTTP Signature аутентификацией.
//
// Подпись — как в официальном SDK cybersource-rest-client-node
// (src/authentication/http/HTTPSigToken.js, SignatureParameterGenerator.js) и в
// «Construct Messages Using HTTP Signature Security» (developer.cybersource.com):
//   digest:     "SHA-256=" + base64(sha256(тело запроса)) — только POST/PUT/PATCH;
//   строка:     строки "имя: значение", разделитель "\n", без завершающего "\n",
//               в порядке списка headers: host, date, request-target, [digest], v-c-merchant-id;
//               request-target = "<метод в нижнем регистре> <путь>";
//   ключ HMAC:  base64-декодированный Shared Secret; подпись = base64(HMAC-SHA256(строка));
//   заголовок:  signature: keyid="…", algorithm="HmacSHA256", headers="…", signature="…".
// ⚠️ CyberSource выводит HTTP Signature из обращения к марту 2027 (переход на JWT).
//
// Секреты — только из env (CS_ENV, CS_MERCHANT_ID, CS_KEY_ID, CS_SHARED_SECRET). Тела
// запросов/ответов не логируются: в лог попадают операция, HTTP-код, статус и id запроса.
import crypto from "node:crypto";
import https from "node:https";

export type CsEnv = "test" | "production";

const HOSTS: Record<CsEnv, string> = {
  test: "apitest.cybersource.com",
  production: "api.cybersource.com",
};

export const CS_TIMEOUT_MS = 15_000;

export class CsConfigError extends Error {}

// Сеть/таймаут: исход операции у CyberSource НЕИЗВЕСТЕН — не повторять, а сверять (search.ts).
export class CsTransportError extends Error {
  constructor(
    readonly kind: "timeout" | "network",
    message: string,
  ) {
    super(message);
  }
}

export type CsConfig = { env: CsEnv; host: string; merchantId: string; keyId: string; sharedSecret: string };

export function csConfig(): CsConfig {
  const rawEnv = process.env.CS_ENV;
  const env: CsEnv | null = rawEnv === "production" ? "production" : rawEnv === "test" ? "test" : null;
  const merchantId = process.env.CS_MERCHANT_ID ?? "";
  const keyId = process.env.CS_KEY_ID ?? "";
  const sharedSecret = process.env.CS_SHARED_SECRET ?? "";
  const missing = [
    !env && "CS_ENV",
    !merchantId && "CS_MERCHANT_ID",
    !keyId && "CS_KEY_ID",
    !sharedSecret && "CS_SHARED_SECRET",
  ].filter(Boolean);
  // Только имена переменных — значения в сообщения об ошибке не попадают.
  if (missing.length || !env) throw new CsConfigError(`CyberSource не настроен: ${missing.join(", ")}`);
  return { env, host: HOSTS[env], merchantId, keyId, sharedSecret };
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const hasBody = (m: HttpMethod) => m === "POST" || m === "PUT" || m === "PATCH";

export function digestOf(body: string): string {
  return "SHA-256=" + crypto.createHash("sha256").update(body, "utf8").digest("base64");
}

// Детерминированная подпись (без сети и env) — проверяется юнит-тестами.
export function buildAuthHeaders(input: {
  method: HttpMethod;
  host: string;
  path: string; // путь с query-строкой, как он уходит в запрос
  body: string; // для GET/DELETE игнорируется
  merchantId: string;
  keyId: string;
  sharedSecret: string; // base64
  date: string; // RFC 1123 (Date#toUTCString)
}): Record<string, string> {
  const withDigest = hasBody(input.method);
  const digest = withDigest ? digestOf(input.body) : null;
  const names = withDigest
    ? ["host", "date", "request-target", "digest", "v-c-merchant-id"]
    : ["host", "date", "request-target", "v-c-merchant-id"];
  const values: Record<string, string> = {
    host: input.host,
    date: input.date,
    "request-target": `${input.method.toLowerCase()} ${input.path}`,
    ...(digest ? { digest } : {}),
    "v-c-merchant-id": input.merchantId,
  };
  const signingString = names.map((n) => `${n}: ${values[n]}`).join("\n");
  const signature = crypto
    .createHmac("sha256", Buffer.from(input.sharedSecret, "base64"))
    .update(signingString, "utf8")
    .digest("base64");
  return {
    host: input.host,
    date: input.date,
    ...(digest ? { digest } : {}),
    "v-c-merchant-id": input.merchantId,
    signature: `keyid="${input.keyId}", algorithm="HmacSHA256", headers="${names.join(" ")}", signature="${signature}"`,
  };
}

export type CsResponse = {
  httpStatus: number;
  json: Record<string, unknown> | null; // null — пустое тело (204) или не JSON
  requestId: string | null; // id ресурса/транзакции CyberSource из тела ответа
  correlationId: string | null; // заголовок v-c-correlation-id
  ms: number;
};

// Один подписанный запрос. Не бросает на 4xx/5xx (их разбирает вызывающий); бросает
// CsTransportError на таймаут/сеть и CsConfigError без конфигурации.
export async function csRequest(args: {
  op: string; // имя операции для лога (без идентификаторов карт/токенов)
  method: HttpMethod;
  path: string;
  body?: unknown;
}): Promise<CsResponse> {
  const cfg = csConfig();
  const body = args.body === undefined ? "" : JSON.stringify(args.body);
  const headers: Record<string, string> = {
    ...buildAuthHeaders({
      method: args.method,
      host: cfg.host,
      path: args.path,
      body,
      merchantId: cfg.merchantId,
      keyId: cfg.keyId,
      sharedSecret: cfg.sharedSecret,
      date: new Date().toUTCString(),
    }),
    accept: acceptFor(args.path),
    "user-agent": "imoghid-cs-client/1",
  };
  if (hasBody(args.method)) {
    headers["content-type"] = "application/json;charset=utf-8";
    headers["content-length"] = String(Buffer.byteLength(body, "utf8"));
  }

  const started = Date.now();
  const raw = await new Promise<{ status: number; text: string; correlationId: string | null }>(
    (resolve, reject) => {
      const req = https.request(
        { hostname: cfg.host, port: 443, method: args.method, path: args.path, headers, timeout: CS_TIMEOUT_MS },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const cid = res.headers["v-c-correlation-id"];
            resolve({
              status: res.statusCode ?? 0,
              text: Buffer.concat(chunks).toString("utf8"),
              correlationId: typeof cid === "string" ? cid : null,
            });
          });
          res.on("error", (e) => reject(new CsTransportError("network", e.message)));
        },
      );
      req.on("timeout", () => req.destroy(new CsTransportError("timeout", `timeout ${CS_TIMEOUT_MS}ms`)));
      req.on("error", (e) => reject(e instanceof CsTransportError ? e : new CsTransportError("network", e.message)));
      if (body && hasBody(args.method)) req.write(body);
      req.end();
    },
  ).catch((e: unknown) => {
    logCs({ op: args.op, http: 0, status: e instanceof CsTransportError ? e.kind : "error", requestId: null, correlationId: null, ms: Date.now() - started });
    throw e;
  });

  let json: Record<string, unknown> | null = null;
  if (raw.text) {
    try {
      const parsed: unknown = JSON.parse(raw.text);
      json = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      json = null; // не JSON (напр. HTML прокси) — разбор статуса только по HTTP-коду
    }
  }
  const requestId = typeof json?.id === "string" ? json.id : null;
  const result: CsResponse = { httpStatus: raw.status, json, requestId, correlationId: raw.correlationId, ms: Date.now() - started };
  logCs({ op: args.op, http: raw.status, status: typeof json?.status === "string" ? json.status : null, requestId, correlationId: raw.correlationId, ms: result.ms });
  return result;
}

// Лог одной операции: id запроса нужен для приёмки банка. Без тел, токенов и данных карты.
function logCs(line: { op: string; http: number; status: string | null; requestId: string | null; correlationId: string | null; ms: number }) {
  const s = JSON.stringify({ evt: "cs_request", ...line });
  if (line.http >= 200 && line.http < 300) console.info(s);
  else console.warn(s);
}

// Accept зависит от API (проверено на тестовой среде): pts (платежи) отвечает только на
// application/hal+json (с application/json — 404); tss (поиск) и tms (токены) с hal+json
// отвечают 406 Not Acceptable и принимают application/json.
export function acceptFor(path: string): string {
  return path.startsWith("/pts/") ? "application/hal+json;charset=utf-8" : "application/json;charset=utf-8";
}

// Идентификаторы в путях (id транзакций и токенов TMS) — только безопасные символы.
export function safePathId(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error("Некорректный идентификатор CyberSource");
  return id;
}
