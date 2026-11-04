// Список targetOrigins для capture context Unified Checkout — чистая функция (без process.env),
// чтобы её можно было тестировать. Правила:
//   • явный список CS_UC_TARGET_ORIGINS (через запятую) — всегда;
//   • в Vercel Preview (vercelEnv === "preview", и только там) к нему добавляется origin
//     https://<VERCEL_BRANCH_URL> текущей ветки — иначе форма не открывается на алиасе ветки;
//   • production и локально — только явный список;
//   • формат строго: https, host[:port], без пути, без масок (*), без дублей.
const ORIGIN_RE = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;

export function normalizeOrigin(raw: string): string | null {
  const o = raw.trim().replace(/\/+$/, "");
  return ORIGIN_RE.test(o) ? o : null;
}

export function buildTargetOrigins(env: { explicit?: string; vercelEnv?: string; branchUrl?: string }): string[] {
  const out: string[] = [];
  const add = (raw: string) => {
    const o = normalizeOrigin(raw);
    if (o && !out.includes(o)) out.push(o);
  };
  for (const part of (env.explicit ?? "").split(",")) add(part);
  if (env.vercelEnv === "preview") {
    const host = (env.branchUrl ?? "").trim();
    // VERCEL_BRANCH_URL — только хост; значение со схемой или путём считаем некорректным.
    if (host) add(`https://${host}`);
  }
  return out;
}
