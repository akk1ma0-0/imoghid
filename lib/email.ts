import crypto from "node:crypto";
import nodemailer from "nodemailer";

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
