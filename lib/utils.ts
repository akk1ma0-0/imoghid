/**
 * Объединяет классы, отбрасывая falsy-значения.
 * Лёгкая замена clsx для простых случаев.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Форматирует дату в локали ru-RU.
 */
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}
