// VictoriaBank e-Gateway — подпись/проверка P_SIGN, форма инициации (TRTYPE=0),
// завершение продажи (TRTYPE=21). Протокол — docs/VictoriaBank_eGateway_Integration.html.
// ⚠️ TEST-окружение по умолчанию (ecomt.victoriabank.md). Боевой vb059.vb.md НЕ используется.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ── Конфигурация из окружения ──
export function vbConfig() {
  return {
    terminal: process.env.VB_TERMINAL ?? "",
    merchant: process.env.VB_MERCHANT ?? "",
    gatewayUrl: process.env.VB_GATEWAY_URL ?? "https://ecomt.victoriabank.md/cgi-bin/cgi_link",
    merchName: process.env.VB_MERCH_NAME ?? "BlackSpace Tech SRL",
    merchUrl: process.env.VB_MERCH_URL ?? "https://imoghid.md",
    merchAddress: process.env.VB_MERCH_ADDRESS ?? "bd. Decebal 99D, mun. Chișinău",
    currency: "MDL",
    country: "md",
    merchGmt: "+2",
    lang: "ro",
  };
}

// В Vercel многострочный PEM может храниться с экранированными "\n" (без реальных
// переносов). Реальные переносы есть → оставляем как есть; иначе заменяем "\n" на перенос.
function normalizePem(v: string): string {
  return v.includes("\n") ? v : v.replace(/\\n/g, "\n");
}

// Ключ: приоритет — путь к файлу (localhost-разработка), затем содержимое из env (Vercel).
function loadKey(pathVar: string, contentVar: string, fileFallback?: string): string {
  const p = process.env[pathVar];
  if (p) return fs.readFileSync(p, "utf8");
  const content = process.env[contentVar];
  if (content && content.trim()) return normalizePem(content);
  if (fileFallback) return fs.readFileSync(fileFallback, "utf8");
  throw new Error(`${pathVar} or ${contentVar} must be set`);
}

let _privateKey: string | null = null;
function merchantPrivateKey(): string {
  if (_privateKey) return _privateKey;
  _privateKey = loadKey("MERCHANT_PRIVATE_KEY_PATH", "MERCHANT_PRIVATE_KEY");
  return _privateKey;
}

let _bankKey: string | null = null;
function bankPublicKey(): string {
  if (_bankKey) return _bankKey;
  _bankKey = loadKey(
    "VB_BANK_PUBLIC_KEY_PATH",
    "VICTORIA_PUB_KEY",
    path.join(process.cwd(), "docs", "victoria_pub.pem"),
  );
  return _bankKey;
}

// ── MAC-строка: для каждого поля length(value)+value; пустое или "-" → "-" (без длины) ──
export function buildMac(fields: string[]): string {
  return fields.map((f) => (f === "" || f === "-" ? "-" : `${f.length}${f}`)).join("");
}

// P_SIGN для исходящих запросов (TRTYPE=0/21/24): ORDER, NONCE, TIMESTAMP, TRTYPE, AMOUNT.
export function psignGenerate(
  order: string,
  nonce: string,
  timestamp: string,
  trtype: string,
  amount: string,
): string {
  const mac = buildMac([order, nonce, timestamp, trtype, amount]);
  return crypto
    .sign("sha256", Buffer.from(mac, "utf8"), {
      key: merchantPrivateKey(),
      padding: crypto.constants.RSA_PKCS1_PADDING,
    })
    .toString("hex")
    .toUpperCase();
}

// Проверка P_SIGN входящего callback: ACTION, RC, RRN, ORDER, AMOUNT (пустые → "-").
export function psignVerifyCallback(params: Record<string, string>): boolean {
  const pSign = (params.P_SIGN || "").trim();
  if (!pSign) return false;
  const fields = ["ACTION", "RC", "RRN", "ORDER", "AMOUNT"].map((k) => (params[k] || "").trim());
  const mac = buildMac(fields);
  try {
    return crypto.verify(
      "sha256",
      Buffer.from(mac, "utf8"),
      { key: bankPublicKey(), padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(pSign, "hex"),
    );
  } catch {
    return false;
  }
}

export function generateNonce(): string {
  return crypto.randomBytes(20).toString("hex").toUpperCase();
}

export function generateTimestamp(): string {
  const d = new Date();
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0") +
    String(d.getUTCHours()).padStart(2, "0") +
    String(d.getUTCMinutes()).padStart(2, "0") +
    String(d.getUTCSeconds()).padStart(2, "0")
  );
}

export function formatAmount(a: number): string {
  return Number(a).toFixed(2);
}

function escapeAttr(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── TRTYPE=0: авто-сабмит HTML-форма на страницу оплаты банка ──
export function buildPaymentFormHtml(args: {
  order: string;
  amount: string;
  desc: string;
  email: string;
  backref: string;
}): string {
  const c = vbConfig();
  const nonce = generateNonce();
  const timestamp = generateTimestamp();
  const pSign = psignGenerate(args.order, nonce, timestamp, "0", args.amount);

  const params: Record<string, string> = {
    AMOUNT: args.amount,
    CURRENCY: c.currency,
    ORDER: args.order,
    DESC: args.desc,
    MERCH_NAME: c.merchName,
    MERCH_URL: c.merchUrl,
    MERCHANT: c.merchant,
    TERMINAL: c.terminal,
    EMAIL: args.email,
    TRTYPE: "0",
    COUNTRY: c.country,
    MERCH_GMT: c.merchGmt,
    TIMESTAMP: timestamp,
    NONCE: nonce,
    BACKREF: args.backref,
    LANG: c.lang,
    MERCH_ADDRESS: c.merchAddress,
    P_SIGN: pSign,
  };

  const inputs = Object.entries(params)
    .map(([k, v]) => `  <input type="hidden" name="${k}" value="${escapeAttr(v)}"/>`)
    .join("\n");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Redirecționare către VictoriaBank…</title></head>
<body><p>Redirecționare către pagina de plată…</p>
<form id="vbForm" method="POST" action="${c.gatewayUrl}">
${inputs}
</form>
<script>document.getElementById('vbForm').submit();</script>
</body></html>`;
}

// ── TRTYPE=21: завершение продажи (захват средств), server-to-server ──
// Возвращает распарсенные поля из HTML-ответа банка (в т.ч. RC).
export async function vbCompletion(args: {
  order: string;
  amount: string;
  currency: string;
  rrn: string;
  intRef: string;
}): Promise<Record<string, string>> {
  const c = vbConfig();
  const nonce = generateNonce();
  const timestamp = generateTimestamp();
  const pSign = psignGenerate(args.order, nonce, timestamp, "21", args.amount);

  const params: Record<string, string> = {
    ORDER: args.order,
    AMOUNT: args.amount,
    CURRENCY: args.currency,
    TERMINAL: c.terminal,
    TRTYPE: "21",
    TIMESTAMP: timestamp,
    NONCE: nonce,
    RRN: args.rrn,
    INT_REF: args.intRef,
    P_SIGN: pSign,
  };

  const res = await fetch(c.gatewayUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(30_000),
  });
  const html = await res.text();

  // Банк возвращает HTML со скрытыми input-полями.
  const result: Record<string, string> = {};
  const re = /name="(\w+)"[^>]+value="([^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) result[m[1]] = m[2];
  return result;
}
