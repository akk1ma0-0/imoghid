import type { UserRole } from "@prisma/client";

// Переключатель платёжного провайдера на время перехода VictoriaBank → CyberSource.
//   PAYMENT_PROVIDER=victoriabank (по умолчанию) | cybersource
//   CS_BETA_EMAILS — e-mail через запятую: только им (и ADMIN) открыт поток CyberSource.
// Всем остальным — прежний поток VictoriaBank без изменений.
export function paymentProvider(): "victoriabank" | "cybersource" {
  return (process.env.PAYMENT_PROVIDER ?? "").trim().toLowerCase() === "cybersource" ? "cybersource" : "victoriabank";
}

export function csBetaEmails(): string[] {
  return (process.env.CS_BETA_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isCyberSourceEnabledFor(user: { email: string; role: UserRole }): boolean {
  if (paymentProvider() !== "cybersource") return false;
  return user.role === "ADMIN" || csBetaEmails().includes(user.email.trim().toLowerCase());
}
