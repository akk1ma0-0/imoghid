// Якорь заголовка юридической страницы: "Abonament, tarife și plăți" → "abonament-tarife-si-plati".
export function legalSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
