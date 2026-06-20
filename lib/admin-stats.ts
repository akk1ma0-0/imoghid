// Расчёт стоимости вызовов Claude API для admin-статистики.
// Обе AI-функции (Step 3 — анализ документов, генератор анонсов) используют claude-sonnet-4-6.

// Цены claude-sonnet-4-6, $/1M токенов.
export const CLAUDE_PRICING = { inputPerM: 3, outputPerM: 15 } as const;

// Токены анонса логируются в AnuntGeneration (точно). Токены анализа документов
// по-вызовно НЕ сохраняются (есть только счётчик User.analysisCount), поэтому
// стоимость анализов — оценка по средним значениям ниже.
export const EST_ANALYSIS_TOKENS = { input: 4000, output: 1200 } as const;

export function startOfMonth(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// Стоимость в USD по числу входных/выходных токенов.
export function tokensCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * CLAUDE_PRICING.inputPerM +
    (outputTokens / 1_000_000) * CLAUDE_PRICING.outputPerM
  );
}
