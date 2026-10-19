// Экранирование значений, подставляемых в HTML-часть писем (и любой другой HTML-строки).
// Обязательно для всего, что пришло из БД или от пользователя: имя, название агентства, e-mail,
// ссылки с токеном и т.п. В plain-text версии писем экранирование НЕ нужно.
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
