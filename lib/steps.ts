import type { TransactionStep } from "@prisma/client";

// Единый источник правды для соответствия номеров шагов (1–8) и enum TransactionStep.
export const ORDERED_STEPS: readonly TransactionStep[] = [
  "DATE_OBIECT", // 1
  "INCARCARE", // 2
  "VERIFICARE_ACTE", // 3
  "COPROPRIETARI", // 4
  "LISTA_NOTAR", // 5
  "PLATI", // 6
  "RAPORT", // 7
  "PROGRAMARE_ASP", // 8
];

export const TOTAL_STEPS = ORDERED_STEPS.length;

export function stepToNumber(step: TransactionStep): number {
  return ORDERED_STEPS.indexOf(step) + 1;
}

export function isValidStepNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= TOTAL_STEPS;
}

export class StepRangeError extends Error {}

export function numberToStep(n: number): TransactionStep {
  if (!isValidStepNumber(n)) {
    throw new StepRangeError(`Pas invalid: ${n}`);
  }
  return ORDERED_STEPS[n - 1];
}
