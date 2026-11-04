// Смена плана личной подписки CyberSource (PERSONAL) — чистые правила (без БД/сети), под тесты.
//   Basic → Pro — сразу: новая оплата полной суммы Pro (Unified Checkout, 3DS, новое согласие),
//                 новая подписка с периодом от даты оплаты; старая закрывается без возврата.
//   Pro → Basic — со следующего периода: pendingPlan/pendingAmount/pendingFrom на подписке;
//                 в текущем периоде план и лимиты Pro не меняются; до списания можно отменить.
// Подписки VictoriaBank и агентские (AGENCY) сюда не попадают.

export type PersonalPlan = "BASIC" | "PRO";

export type PlanChangeSub = {
  status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
  nextChargeAt: Date | null;
  billingHold: string | null;
  plan: string;
  amount: string | null;
  pendingPlan?: string | null;
  pendingAmount?: string | null;
  pendingFrom?: Date | null;
};

export type PlanChangeKind = "upgrade" | "downgrade" | "same" | "invalid";

const RANK: Record<string, number> = { BASIC: 1, PRO: 2 };

export function classifyPlanChange(current: string, target: string): PlanChangeKind {
  const a = RANK[current];
  const b = RANK[target];
  if (!a || !b) return "invalid";
  return b > a ? "upgrade" : b < a ? "downgrade" : "same";
}

const canceled = (s: PlanChangeSub) => s.cancelAtPeriodEnd || s.status === "CANCELED";
const ended = (s: PlanChangeSub, now: Date) => s.status === "EXPIRED" || now.getTime() >= s.currentPeriodEnd.getTime();

// chargeInFlight — по подписке есть автосписание PENDING/UNKNOWN (исход ещё не ясен).
export type PlanChangeCtx = { now: Date; chargeInFlight: boolean };

export type UpgradeReason = "NOT_BASIC" | "ENDED" | "HOLD" | "CHARGE_IN_PROGRESS";
export type UpgradeCheck = { ok: true } | { ok: false; reason: UpgradeReason };

// Basic → Pro. Разрешено и при просрочке (PAST_DUE), и для отменённой (новая оплата и новое
// согласие закрывают старую подписку). Нельзя: план не Basic, подписка закончилась, удержание
// админом, или идёт автосписание с неясным исходом (иначе возможна двойная оплата).
export function canUpgrade(s: PlanChangeSub, ctx: PlanChangeCtx): UpgradeCheck {
  if (ended(s, ctx.now)) return { ok: false, reason: "ENDED" };
  if (s.plan !== "BASIC") return { ok: false, reason: "NOT_BASIC" };
  if (s.billingHold) return { ok: false, reason: "HOLD" };
  if (ctx.chargeInFlight) return { ok: false, reason: "CHARGE_IN_PROGRESS" };
  return { ok: true };
}

export type DowngradeReason =
  | "NOT_PRO"
  | "ENDED"
  | "PAST_DUE"
  | "CANCELED"
  | "HOLD"
  | "ALREADY_SCHEDULED"
  | "RENEWAL_IN_PROGRESS";
export type DowngradeCheck = { ok: true } | { ok: false; reason: DowngradeReason };

// Pro → Basic со следующего периода. Только активная (оплаченная), не отменённая подписка без
// уже запланированной смены. Если подошёл срок списания (или оно идёт) — ждём его исхода:
// иначе смена «съехала» бы на период позже показанной даты.
export function canDowngrade(s: PlanChangeSub, ctx: PlanChangeCtx): DowngradeCheck {
  if (ended(s, ctx.now)) return { ok: false, reason: "ENDED" };
  if (s.plan !== "PRO") return { ok: false, reason: "NOT_PRO" };
  if (canceled(s)) return { ok: false, reason: "CANCELED" };
  if (s.status === "PAST_DUE") return { ok: false, reason: "PAST_DUE" };
  if (s.billingHold) return { ok: false, reason: "HOLD" };
  if (s.pendingPlan) return { ok: false, reason: "ALREADY_SCHEDULED" };
  if (ctx.chargeInFlight || (s.nextChargeAt && ctx.now.getTime() >= s.nextChargeAt.getTime())) {
    return { ok: false, reason: "RENEWAL_IN_PROGRESS" };
  }
  return { ok: true };
}

export type CancelDowngradeCheck = { ok: true } | { ok: false; reason: "NOT_SCHEDULED" | "RENEWAL_IN_PROGRESS" };

// Отмена запланированного Pro → Basic — пока списание за новый период не началось.
export function canCancelDowngrade(s: PlanChangeSub, ctx: PlanChangeCtx): CancelDowngradeCheck {
  if (!s.pendingPlan || !s.pendingFrom) return { ok: false, reason: "NOT_SCHEDULED" };
  if (ctx.now.getTime() >= s.pendingFrom.getTime()) return { ok: false, reason: "RENEWAL_IN_PROGRESS" };
  if (ctx.chargeInFlight || (s.nextChargeAt && ctx.now.getTime() >= s.nextChargeAt.getTime())) {
    return { ok: false, reason: "RENEWAL_IN_PROGRESS" };
  }
  return { ok: true };
}

// План и сумма для периода, начинающегося в periodStart: запланированная смена действует с
// pendingFrom (включительно). amount=null — суммы нет (вызывающий решает, откуда её взять).
export function termsForPeriod(s: PlanChangeSub, periodStart: Date): { plan: string; amount: string | null; changed: boolean } {
  if (s.pendingPlan && s.pendingAmount && s.pendingFrom && periodStart.getTime() >= s.pendingFrom.getTime()) {
    return { plan: s.pendingPlan, amount: s.pendingAmount, changed: s.pendingPlan !== s.plan };
  }
  return { plan: s.plan, amount: s.amount, changed: false };
}

// ── Тексты для клиента (румынский, простым языком) ──
export const UPGRADE_DENIED_TEXT: Record<UpgradeReason, string> = {
  NOT_BASIC: "Aveți deja planul Pro.",
  ENDED: "Abonamentul s-a încheiat. Alegeți din nou un plan.",
  HOLD: "Schimbarea planului nu este disponibilă acum. Contactați-ne la info@biseeth.md.",
  CHARGE_IN_PROGRESS: "Plata lunară este în curs de procesare. Încercați din nou peste câteva ore.",
};

export const DOWNGRADE_DENIED_TEXT: Record<Exclude<DowngradeReason, "ALREADY_SCHEDULED">, string> = {
  NOT_PRO: "Aveți deja planul Basic.",
  ENDED: "Abonamentul s-a încheiat. Alegeți din nou un plan.",
  PAST_DUE: "Mai întâi trebuie achitată plata lunară restantă.",
  CANCELED: "Abonamentul este anulat. Reluați abonamentul, apoi puteți schimba planul.",
  HOLD: "Schimbarea planului nu este disponibilă acum. Contactați-ne la info@biseeth.md.",
  RENEWAL_IN_PROGRESS: "Reînnoirea abonamentului este în curs. Încercați din nou după ce se finalizează.",
};

export const CANCEL_DOWNGRADE_DENIED_TEXT = {
  RENEWAL_IN_PROGRESS: "Reînnoirea cu planul nou este deja în curs și nu mai poate fi oprită.",
} as const;
