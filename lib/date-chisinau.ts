// DD.MM.YYYY по времени Молдовы — не зависит от часового пояса браузера/сервера.
// Без зависимостей от сервера: безопасно импортировать из клиентских компонентов.
export function fmtDateChisinau(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Chisinau",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("day")}.${g("month")}.${g("year")}`;
}

// Строка срока плана: «Activ până la DD.MM.YYYY» или «Activ (fără expirare)», если срока нет.
export function planExpiryLabel(expiresAt: string | null): string {
  return expiresAt ? `Activ până la ${fmtDateChisinau(expiresAt)}` : "Activ (fără expirare)";
}
