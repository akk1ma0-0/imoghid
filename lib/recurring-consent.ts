// Текст согласия на автосписание (показывается на /app/checkout и сохраняется в RecurringConsent
// с версией). Модуль без серверных зависимостей — импортируется и клиентом, и сервером.
// Меняете формулировку → поднимите версию: старые согласия остаются со своей версией.
export const RECURRING_CONSENT_VERSION = "2026-11-02.ro.v1";

export function recurringConsentText(amount: string, currency: string): string {
  return (
    `Sunt de acord ca suma de ${amount} ${currency} să fie debitată automat în fiecare lună de pe ` +
    `cardul meu, până la anularea abonamentului, și ca datele cardului să fie salvate în mod ` +
    `securizat (sub formă de token) pentru aceste plăți. Pot anula oricând din contul meu.`
  );
}

export const TERMS_CONSENT_TEXT =
  "Am citit și accept Termenii și Condițiile, inclusiv condițiile de plată și Politica de returnare.";

// ── Агентская подписка: изменение числа мест ──
// Докупка: оплата сейчас (пропорция остатка периода) + новая месячная сумма со следующего периода.
export const AGENCY_TOPUP_CONSENT_VERSION = "2026-11-04.ro.agency-topup.v1";

export function agencyTopupConsentText(nowAmount: string, monthlyAmount: string, currency: string, seats: number): string {
  return (
    `Sunt de acord să plătesc acum ${nowAmount} ${currency} pentru locurile noi până la sfârșitul lunii ` +
    `plătite, iar apoi suma de ${monthlyAmount} ${currency} (${seats} locuri) să fie debitată automat în ` +
    `fiecare lună de pe cardul introdus acum, până la anularea abonamentului. Cardul introdus înlocuiește ` +
    `cardul salvat anterior. Pot anula oricând din pagina agenției.`
  );
}

// Уменьшение мест (или отмена уменьшения): новая месячная сумма со следующего периода, без оплаты сейчас.
export const AGENCY_SEATS_CONSENT_VERSION = "2026-11-04.ro.agency-seats.v1";

export function agencySeatsConsentText(monthlyAmount: string, currency: string, seats: number, fromDate: string): string {
  return (
    `Sunt de acord ca, începând cu ${fromDate}, suma de ${monthlyAmount} ${currency} (${seats} locuri) să fie ` +
    `debitată automat în fiecare lună de pe cardul salvat, până la anularea abonamentului.`
  );
}
