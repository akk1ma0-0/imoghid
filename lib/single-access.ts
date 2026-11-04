// «O accesare» (разовый доступ): подсчёт неиспользованных грантов и тексты для интерфейса.
// Чистые функции без БД и сервера — безопасно импортируются и клиентскими компонентами.
// Чтение из БД — getSingleAccessSummary() в lib/usage.ts (там же остальная логика грантов).

// Пакет «O accesare» = по одному гранту на каждую из трёх функций.
export const SINGLE_ACCESS_FEATURES = ["CADASTRU_CHECK", "DOSAR_ANALYSIS", "OBIECTE_CREATE"] as const;
export type SingleAccessFeature = (typeof SINGLE_ACCESS_FEATURES)[number];

export type SingleAccessSummary = {
  total: number; // все неиспользованные гранты пользователя
  byFeature: Record<SingleAccessFeature, number>;
};

export const SINGLE_ACCESS_LABEL_RO: Record<SingleAccessFeature, string> = {
  CADASTRU_CHECK: "verificări cadastrale",
  DOSAR_ANALYSIS: "examinări dosar",
  OBIECTE_CREATE: "obiecte",
};

export function emptySingleAccess(): SingleAccessSummary {
  return { total: 0, byFeature: { CADASTRU_CHECK: 0, DOSAR_ANALYSIS: 0, OBIECTE_CREATE: 0 } };
}

const isKnownFeature = (f: string): f is SingleAccessFeature => (SINGLE_ACCESS_FEATURES as readonly string[]).includes(f);

// Считает только неиспользованные (consumedAt = null). total — все такие гранты (как раньше
// считал PlanStatus); byFeature — только три известные функции.
export function summarizeSingleAccess(grants: readonly { feature: string; consumedAt: Date | null }[]): SingleAccessSummary {
  const out = emptySingleAccess();
  for (const g of grants) {
    if (g.consumedAt) continue;
    out.total += 1;
    if (isKnownFeature(g.feature)) out.byFeature[g.feature] += 1;
  }
  return out;
}

// Разбивка для показа: только функции с остатком > 0, в фиксированном порядке пакета.
export function singleAccessBreakdown(s: SingleAccessSummary): { feature: SingleAccessFeature; label: string; count: number }[] {
  return SINGLE_ACCESS_FEATURES.filter((f) => s.byFeature[f] > 0).map((feature) => ({
    feature,
    label: SINGLE_ACCESS_LABEL_RO[feature],
    count: s.byFeature[feature],
  }));
}

// «verificări cadastrale: 2 · examinări dosar: 1 · obiecte: 1»
export function singleAccessBreakdownText(s: SingleAccessSummary): string {
  return singleAccessBreakdown(s)
    .map((b) => `${b.label}: ${b.count}`)
    .join(" · ");
}

// «1 acces disponibil» / «3 accese disponibile»
export function accessesAvailableText(n: number): string {
  return n === 1 ? "1 acces disponibil" : `${n} accese disponibile`;
}
