import crypto from "node:crypto";
import nodemailer from "nodemailer";
import type { SubscriptionPlan } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 часа

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Создаёт токен верификации (удаляя прежние токены пользователя) и возвращает его.
// newEmail задан → это смена e-mail (адрес подтверждается перед записью в БД);
// null → верификация текущего e-mail при регистрации.
export async function createVerificationToken(
  userId: string,
  newEmail?: string,
): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId } }),
    prisma.emailVerificationToken.create({
      data: { userId, token, expiresAt, newEmail: newEmail ?? null },
    }),
  ]);
  return token;
}

// SMTP-транспорт Zoho (STARTTLS, 587). null — если креды не заданы (dev-режим).
function getTransport() {
  const user = process.env.ZOHO_SMTP_USER;
  const pass = process.env.ZOHO_SMTP_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: "smtp.zoho.eu",
    port: 587,
    secure: false, // STARTTLS
    requireTLS: true,
    auth: { user, pass },
  });
}

// Отправляет письмо подтверждения. Без SMTP-кредов не падает — логирует ссылку в консоль.
export async function sendVerificationEmail(
  email: string,
  token: string,
  origin: string,
): Promise<void> {
  const link = `${origin}/api/auth/verify-email?token=${token}`;
  const tx = getTransport();

  if (!tx) {
    console.log(`[DEV] Verification link: ${link}`);
    return;
  }

  const from = process.env.ZOHO_SMTP_USER as string;
  await tx.sendMail({
    from: `"ImoGhid" <${from}>`,
    to: email,
    subject: "Confirmați adresa de e-mail",
    text:
      `Bine ați venit la ImoGhid!\n\n` +
      `Pentru a finaliza înregistrarea, confirmați adresa de e-mail accesând linkul de mai jos ` +
      `(valabil 24 de ore):\n${link}\n\n` +
      `Dacă nu ați creat un cont ImoGhid, ignorați acest mesaj.`,
    html:
      `<div style="font-family:Inter,system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;color:#111827">` +
      `<h2 style="font-size:18px;margin:0 0 12px">Confirmați adresa de e-mail</h2>` +
      `<p style="font-size:14px;line-height:1.6;color:#374151">Bine ați venit la <b>ImoGhid</b>! Apăsați butonul de mai jos pentru a confirma adresa dvs. de e-mail.</p>` +
      `<p style="margin:20px 0"><a href="${link}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px">Confirmă adresa</a></p>` +
      `<p style="font-size:12.5px;color:#6b7280;line-height:1.6">Linkul este valabil <b>24 de ore</b>. Dacă butonul nu funcționează, copiați adresa: <br>${link}</p>` +
      `<p style="font-size:12px;color:#9ca3af;margin-top:18px">Dacă nu ați creat un cont ImoGhid, ignorați acest mesaj.</p>` +
      `</div>`,
  });
}

// ── Bon electronic (email-чек после успешной оплаты) ──────────────────────────
// Реквизиты продавца (требование банка для чека).
const MERCHANT_NAME = "BlackSpace Tech SRL";
const MERCHANT_COUNTRY = "Moldova";
const MERCHANT_URL = "imoghid.md";
const SUPPORT_EMAIL = "info@biseeth.md";
const SUPPORT_PHONE = "+373 69 427 567";
const RETURN_POLICY_URL = "https://imoghid.md/termeni";

type ReceiptData = {
  order: string;
  amount: string; // "300.00"
  currency: string; // "MDL"
  plan: SubscriptionPlan;
  rrn: string | null;
  approval: string | null;
  cardLast4: string | null;
  cardNetwork: string | null; // "Visa" | "Mastercard" | null
  paidAt: Date;
};

// Дата/время в формате DD/MM/YYYY HH:MM:SS по времени Молдовы (как просил банк).
function formatReceiptDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Chisinau",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("day")}/${g("month")}/${g("year")} ${g("hour")}:${g("minute")}:${g("second")}`;
}

// Отправляет bon electronic (чек) на e-mail пользователя после успешной оплаты.
// Без SMTP-кредов не падает — логирует чек в консоль (dev-режим). Все вызовы обёрнуты
// в try/catch на стороне callback — сбой почты НЕ ломает обработку платежа.
export async function sendReceiptEmail(email: string, r: ReceiptData): Promise<void> {
  const planLabel = r.plan === "PRO" ? "Plan Pro" : "Plan Basic";
  const service = `Abonament ImoGhid — ${planLabel}`;
  const dateStr = formatReceiptDate(r.paidAt);
  const opType = `Plată cu cardul ${r.cardNetwork ?? "Visa/Mastercard"}`;
  const amountStr = `${r.amount} ${r.currency}`;
  const cardStr = r.cardLast4 ? `•••• ${r.cardLast4}` : null;

  // Строки чека (имя держателя карты банк НЕ передаёт — строку не включаем).
  const rows: [string, string | null][] = [
    ["Comerciant", MERCHANT_NAME],
    ["Țara comerciantului", MERCHANT_COUNTRY],
    ["Site", MERCHANT_URL],
    ["Data și ora", dateStr],
    ["Tip operațiune", opType],
    ["Serviciu", service],
    ["Sumă", amountStr],
    ["Număr comandă", r.order],
    ["RRN", r.rrn],
    ["Cod de autorizare", r.approval],
    ["Card", cardStr],
  ];
  const visible = rows.filter(([, v]) => v && v.trim() !== "");

  const tx = getTransport();
  if (!tx) {
    console.log(
      `[DEV] Bon electronic (→ ${email}):`,
      JSON.stringify(Object.fromEntries(visible)),
    );
    return;
  }

  const textLines = visible.map(([k, v]) => `${k}: ${v}`).join("\n");
  const text =
    `ImoGhid — Bon electronic (confirmare plată)\n\n` +
    `${textLines}\n\n` +
    `Politica de returnare: ${RETURN_POLICY_URL} (secțiunea „Plată și rambursare")\n` +
    `Suport: ${SUPPORT_EMAIL} · ${SUPPORT_PHONE}\n`;

  const rowsHtml = visible
    .map(
      ([k, v]) =>
        `<tr><td style="padding:7px 0;font-size:13px;color:#6b7280;vertical-align:top;white-space:nowrap">${k}</td>` +
        `<td style="padding:7px 0 7px 18px;font-size:13px;color:#111827;font-weight:600;text-align:right">${v}</td></tr>`,
    )
    .join("");

  const html =
    `<div style="font-family:Inter,system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;color:#111827">` +
    `<h2 style="font-size:18px;margin:0 0 4px">Bon electronic</h2>` +
    `<p style="font-size:13px;color:#6b7280;margin:0 0 18px">Confirmarea plății pentru abonamentul ImoGhid.</p>` +
    `<table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">${rowsHtml}</table>` +
    `<p style="font-size:12px;color:#6b7280;line-height:1.7;margin:16px 0 0">` +
    `Detalii privind rambursarea: <a href="${RETURN_POLICY_URL}" style="color:#1d4ed8;text-decoration:none">Termeni și Condiții — „Plată și rambursare"</a>.` +
    `</p>` +
    `<p style="font-size:12px;color:#6b7280;line-height:1.7;margin:8px 0 0">` +
    `Suport: <a href="mailto:${SUPPORT_EMAIL}" style="color:#1d4ed8;text-decoration:none">${SUPPORT_EMAIL}</a> · ${SUPPORT_PHONE}` +
    `</p>` +
    `<p style="font-size:11px;color:#9ca3af;margin-top:18px">${MERCHANT_NAME} · ${MERCHANT_COUNTRY} · ${MERCHANT_URL}</p>` +
    `</div>`;

  const from = process.env.ZOHO_SMTP_USER as string;
  await tx.sendMail({
    from: `"ImoGhid" <${from}>`,
    to: email,
    subject: `Bon electronic — Abonament ImoGhid (comanda ${r.order})`,
    text,
    html,
  });
}

// Отправляет письмо для ПОДТВЕРЖДЕНИЯ НОВОГО e-mail (смена адреса из /app/profile).
// Уходит на новый адрес. Без SMTP-кредов не падает — логирует ссылку в консоль.
export async function sendEmailChangeEmail(
  newEmail: string,
  token: string,
  origin: string,
): Promise<void> {
  const link = `${origin}/api/auth/verify-email?token=${token}`;
  const tx = getTransport();

  if (!tx) {
    console.log(`[DEV] Email-change verification link (→ ${newEmail}): ${link}`);
    return;
  }

  const from = process.env.ZOHO_SMTP_USER as string;
  await tx.sendMail({
    from: `"ImoGhid" <${from}>`,
    to: newEmail,
    subject: "Confirmați noua adresă de e-mail",
    text:
      `Ați solicitat schimbarea adresei de e-mail a contului ImoGhid.\n\n` +
      `Pentru a confirma noua adresă, accesați linkul de mai jos (valabil 24 de ore):\n${link}\n\n` +
      `Adresa contului va fi schimbată doar după accesarea acestui link. ` +
      `Dacă nu ați solicitat această schimbare, ignorați mesajul — contul rămâne pe adresa curentă.`,
    html:
      `<div style="font-family:Inter,system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;color:#111827">` +
      `<h2 style="font-size:18px;margin:0 0 12px">Confirmați noua adresă de e-mail</h2>` +
      `<p style="font-size:14px;line-height:1.6;color:#374151">Ați solicitat schimbarea adresei de e-mail a contului <b>ImoGhid</b>. Apăsați butonul de mai jos pentru a confirma noua adresă.</p>` +
      `<p style="margin:20px 0"><a href="${link}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px">Confirmă noua adresă</a></p>` +
      `<p style="font-size:12.5px;color:#6b7280;line-height:1.6">Linkul este valabil <b>24 de ore</b>. Adresa va fi schimbată doar după accesarea lui. Dacă butonul nu funcționează, copiați: <br>${link}</p>` +
      `<p style="font-size:12px;color:#9ca3af;margin-top:18px">Dacă nu ați solicitat schimbarea, ignorați acest mesaj — contul rămâne pe adresa curentă.</p>` +
      `</div>`,
  });
}
