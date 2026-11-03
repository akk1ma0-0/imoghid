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
