// targetOrigins для capture context Unified Checkout — чистые функции (без process.env), под тесты.
// Unified Checkout принимает РОВНО ОДИН targetOrigin на сессию: с двумя и более форма падает с
// UNUSED_TARGET_ORIGINS. Поэтому в UC всегда уходит один origin:
//   • Vercel Preview (vercelEnv === "preview", и только там): https://<VERCEL_BRANCH_URL> текущей
//     ветки; если VERCEL_BRANCH_URL нет или он некорректен — первый валидный из CS_UC_TARGET_ORIGINS;
//   • production и локально: первый валидный из CS_UC_TARGET_ORIGINS (остальные игнорируются,
//     предупреждение пишет вызывающий — см. extraExplicitOrigins).
// Формат строго: https, host[:port], без пути, query и масок (*).
const ORIGIN_RE = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;

export function normalizeOrigin(raw: string): string | null {
  const o = raw.trim().replace(/\/+$/, "");
  return ORIGIN_RE.test(o) ? o : null;
}

// Валидные origin'ы явного списка в порядке записи, без дублей.
export function parseExplicitOrigins(explicit: string | undefined): string[] {
  const out: string[] = [];
  for (const part of (explicit ?? "").split(",")) {
    const o = normalizeOrigin(part);
    if (o && !out.includes(o)) out.push(o);
  }
  return out;
}

type Env = { explicit?: string; vercelEnv?: string; branchUrl?: string };

// Origin ветки в Preview: VERCEL_BRANCH_URL — только хост; значение со схемой или путём некорректно.
function previewBranchOrigin(env: Env): string | null {
  if (env.vercelEnv !== "preview") return null;
  const host = (env.branchUrl ?? "").trim();
  return host ? normalizeOrigin(`https://${host}`) : null;
}

// Ровно один origin или пустой массив (нечего слать — вызывающий вернёт ошибку конфигурации).
export function buildTargetOrigins(env: Env): string[] {
  const origin = previewBranchOrigin(env) ?? parseExplicitOrigins(env.explicit)[0];
  return origin ? [origin] : [];
}

// Лишние origin'ы явного списка (после первого), которые не попадут в UC — для предупреждения в
// логе. В Preview с origin'ом ветки явный список не используется намеренно (он общий для веток),
// поэтому предупреждать там не о чем.
export function extraExplicitOrigins(env: Env): string[] {
  if (previewBranchOrigin(env)) return [];
  return parseExplicitOrigins(env.explicit).slice(1);
}
