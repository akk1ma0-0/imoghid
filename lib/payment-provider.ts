import type { UserRole } from "@prisma/client";

// Переключатель платёжного провайдера (VictoriaBank → CyberSource).
//   PAYMENT_PROVIDER=victoriabank (по умолчанию) | cybersource
//   cybersource → поток CyberSource открыт ВСЕМ пользователям.
//   CS_BETA_ONLY=true → прежнее ограничение: только ADMIN и e-mail из CS_BETA_EMAILS (через запятую).
//     По умолчанию выключен.
//   PAYMENT_PROVIDER не задан / другое значение → прежний поток VictoriaBank для всех.
// Исключения вне этой функции (не зависят от флагов): /api/payments/start, страница и
// capture-context оплаты дополнительно пускают владельцев своей подписки CyberSource; докупка
// мест агентства без агентской подписки CyberSource идёт в VictoriaBank.
export function paymentProvider(): "victoriabank" | "cybersource" {
  return (process.env.PAYMENT_PROVIDER ?? "").trim().toLowerCase() === "cybersource" ? "cybersource" : "victoriabank";
}

export function csBetaEmails(): string[] {
  return (process.env.CS_BETA_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function csBetaOnly(): boolean {
  return (process.env.CS_BETA_ONLY ?? "").trim().toLowerCase() === "true";
}

export function isCyberSourceEnabledFor(user: { email: string; role: UserRole }): boolean {
  if (paymentProvider() !== "cybersource") return false;
  if (!csBetaOnly()) return true;
  return user.role === "ADMIN" || csBetaEmails().includes(user.email.trim().toLowerCase());
}
