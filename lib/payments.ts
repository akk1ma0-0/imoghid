import type { SubscriptionPlan } from "@prisma/client";

// Валюта платежей (ISO 4217) — общая для всех провайдеров. PAYMENT_CURRENCY, по умолчанию MDL;
// невалидное значение (не 3 латинские буквы) → MDL, чтобы не отправить банку мусор.
export function paymentCurrency(): string {
  const v = (process.env.PAYMENT_CURRENCY ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(v) ? v : "MDL";
}

// Тарифы (MDL). Тексты описания — временные плейсхолдеры (поправим позже).
export const PLAN_PRICING = {
  BASIC: { amount: 300, label: "Basic", descRo: "Plan de bază pentru agenți" },
  PRO: { amount: 500, label: "Pro", descRo: "Plan avansat cu toate instrumentele" },
} as const;

export function isPayablePlan(v: unknown): v is "BASIC" | "PRO" {
  return v === "BASIC" || v === "PRO";
}

export function planAmount(plan: "BASIC" | "PRO"): number {
  return PLAN_PRICING[plan].amount;
}

// Уникальный числовой ORDER (min 6 цифр). epoch-ms + 4 случайные цифры (17 цифр).
export function generateOrder(): string {
  return `${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
}

export function planFromString(v: string): SubscriptionPlan | null {
  return v === "BASIC" || v === "PRO" ? (v as SubscriptionPlan) : null;
}
