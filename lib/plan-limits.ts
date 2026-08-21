import type { SubscriptionPlan } from "@prisma/client";

// ── Тарифная сетка ImoGhid (TARIFE.pdf), Этап A: только Basic/Pro, месячные лимиты. ──
// Единственный источник правды по лимитам — не разбрасывать числа по коду.
// Infinity = безлимит; 0 = функция недоступна на этом плане (напр. Anunțuri 999 на Basic).

export type LimitedFeature =
  | "CADASTRU_CHECK"
  | "DOSAR_ANALYSIS"
  | "OBIECTE_ACTIVE"
  | "CREATOR_HUB"
  | "ANUNT_999";

// «O accesare» (Этап C) — разовая покупка пакета из 3 одноразовых прав (TARIFE.pdf: 30 MDL).
export const SINGLE_ACCESS_FEE_MDL = 30;

export const PLAN_LIMITS: Record<SubscriptionPlan, Record<LimitedFeature, number>> = {
  BASIC: {
    CADASTRU_CHECK: 50,
    DOSAR_ANALYSIS: 30,
    OBIECTE_ACTIVE: 20,
    CREATOR_HUB: 20,
    ANUNT_999: 0, // недоступно на Basic
  },
  PRO: {
    CADASTRU_CHECK: Infinity,
    DOSAR_ANALYSIS: 60,
    OBIECTE_ACTIVE: Infinity,
    CREATOR_HUB: 60,
    ANUNT_999: 60,
  },
};

// Нет плана → доступа к лимитированным функциям нет (0 по всем фичам).
export function planFeatureLimit(
  plan: SubscriptionPlan | null,
  feature: LimitedFeature,
): number {
  if (!plan) return 0;
  return PLAN_LIMITS[plan][feature];
}

// Доплата sobre-limit (MDL/шт) — ДАННЫЕ-ЗАГОТОВКА для Этапа B. Логика оплаты здесь НЕ
// реализуется (сейчас превышение просто блокируется). null = недоступно/безлимит (доплаты нет).
export const OVER_LIMIT_FEE_MDL: Record<
  SubscriptionPlan,
  Partial<Record<LimitedFeature, number | null>>
> = {
  BASIC: { DOSAR_ANALYSIS: 15, CADASTRU_CHECK: 5 },
  PRO: { DOSAR_ANALYSIS: 10, CADASTRU_CHECK: null }, // Pro cadastru — безлимит
};

// Сумма доплаты sobre-limit (MDL) для фичи на плане, либо null если доплата не
// предусмотрена (Creator Hub/999, Pro cadastru-безлимит, нет плана). Только положительное
// число означает «доплата доступна».
export function overageFeeMdl(
  plan: SubscriptionPlan | null,
  feature: LimitedFeature,
): number | null {
  if (!plan) return null;
  const fee = OVER_LIMIT_FEE_MDL[plan][feature];
  return typeof fee === "number" && fee > 0 ? fee : null;
}

// Метки фич для сообщений об ошибке (ro).
export const FEATURE_LABEL_RO: Record<LimitedFeature, string> = {
  CADASTRU_CHECK: "verificări cadastrale",
  DOSAR_ANALYSIS: "analize de dosar",
  OBIECTE_ACTIVE: "obiecte active",
  CREATOR_HUB: "generări Creator Hub",
  ANUNT_999: "anunțuri 999.md",
};

// Текущий расчётный период — откатной месяц, привязанный ко дню активации плана.
// planActivatedAt=15-е → период 15→15 (НЕ календарный). Корректный перенос дня (31→28/30).
export function currentPeriod(anchor: Date, now: Date): { start: Date; end: Date } {
  const addMonths = (d: Date, n: number): Date => {
    const r = new Date(d.getTime());
    const day = d.getDate();
    r.setDate(1);
    r.setMonth(r.getMonth() + n);
    const daysInMonth = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
    r.setDate(Math.min(day, daysInMonth));
    return r;
  };
  let m =
    (now.getFullYear() - anchor.getFullYear()) * 12 +
    (now.getMonth() - anchor.getMonth());
  let start = addMonths(anchor, m);
  if (start.getTime() > now.getTime()) {
    m -= 1;
    start = addMonths(anchor, m);
  }
  let end = addMonths(anchor, m + 1);
  let guard = 0;
  while (end.getTime() <= now.getTime() && guard < 4) {
    m += 1;
    start = addMonths(anchor, m);
    end = addMonths(anchor, m + 1);
    guard++;
  }
  return { start, end };
}
