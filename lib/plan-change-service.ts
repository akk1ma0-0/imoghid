// Смена плана личной подписки CyberSource (БД). Правила — lib/plan-change-rules.ts.
//   • Pro → Basic: ставим pendingPlan со следующего периода (без списания), письмо клиенту;
//     отмена снимает pending. Применяется при списании за новый период (billing-cycle.ts).
//   • Basic → Pro: проверка перед Unified Checkout (страница оплаты и capture context). Сама
//     замена подписки — в cit.ts после успешной оплаты (Payment.replacesSubscriptionId).
import { prisma } from "@/lib/prisma";
import { sendPlanDowngradeScheduledEmail } from "@/lib/email";
import { PLAN_PRICING } from "@/lib/payments";
import {
  canCancelDowngrade,
  canDowngrade,
  canUpgrade,
  CANCEL_DOWNGRADE_DENIED_TEXT,
  classifyPlanChange,
  DOWNGRADE_DENIED_TEXT,
  UPGRADE_DENIED_TEXT,
} from "@/lib/plan-change-rules";
import {
  chargeInFlight,
  CLEAR_PENDING,
  findOwnSubscription,
  getClientSubscription,
  type ActionResult,
} from "@/lib/subscription-service";

function log(action: string, subscriptionId: string | null, result: string) {
  console.info(JSON.stringify({ evt: "cs_plan_change", action, subscriptionId, result }));
}

const NO_SUB = "Nu aveți un abonament cu reînnoire automată.";

// Pro → Basic со следующего периода. Повтор, когда смена уже запланирована, — changed=false.
export async function scheduleDowngrade(userId: string, now: Date = new Date()): Promise<ActionResult> {
  const sub = await findOwnSubscription(userId, now);
  if (!sub) return { ok: false, status: 404, message: NO_SUB };
  const check = canDowngrade(sub, { now, chargeInFlight: await chargeInFlight(sub.id) });
  if (!check.ok) {
    if (check.reason === "ALREADY_SCHEDULED") {
      log("downgrade", sub.id, "already_scheduled");
      return { ok: true, changed: false, subscription: await getClientSubscription(userId, now) };
    }
    log("downgrade", sub.id, `refused_${check.reason}`);
    return { ok: false, status: 409, message: DOWNGRADE_DENIED_TEXT[check.reason] };
  }
  const amount = PLAN_PRICING.BASIC.amount.toFixed(2);
  // Условия повторяют проверку — параллельный запрос или списание между чтением и записью не пройдут.
  const upd = await prisma.subscription.updateMany({
    where: {
      id: sub.id,
      plan: "PRO",
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      pendingPlan: null,
      billingHold: null,
      currentPeriodEnd: sub.currentPeriodEnd,
    },
    data: { pendingPlan: "BASIC", pendingAmount: amount, pendingFrom: sub.currentPeriodEnd, pendingSetAt: now },
  });
  log("downgrade", sub.id, upd.count ? "scheduled" : "already_scheduled");
  if (upd.count) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (user) {
      try {
        await sendPlanDowngradeScheduledEmail(user.email, {
          name: user.name,
          fromPlan: "PRO",
          toPlan: "BASIC",
          amount,
          currency: sub.currency ?? "MDL",
          effectiveAt: sub.currentPeriodEnd,
        });
      } catch (e) {
        console.warn(JSON.stringify({ evt: "cs_plan_change", subscriptionId: sub.id, warn: "email_failed", message: e instanceof Error ? e.message : String(e) }));
      }
    }
  }
  return { ok: true, changed: upd.count > 0, subscription: await getClientSubscription(userId, now) };
}

// Отмена запланированной смены, пока списание за новый период не началось. Нечего отменять — changed=false.
export async function cancelScheduledDowngrade(userId: string, now: Date = new Date()): Promise<ActionResult> {
  const sub = await findOwnSubscription(userId, now);
  if (!sub) return { ok: false, status: 404, message: NO_SUB };
  const check = canCancelDowngrade(sub, { now, chargeInFlight: await chargeInFlight(sub.id) });
  if (!check.ok) {
    if (check.reason === "NOT_SCHEDULED") {
      log("cancel_downgrade", sub.id, "not_scheduled");
      return { ok: true, changed: false, subscription: await getClientSubscription(userId, now) };
    }
    log("cancel_downgrade", sub.id, `refused_${check.reason}`);
    return { ok: false, status: 409, message: CANCEL_DOWNGRADE_DENIED_TEXT[check.reason] };
  }
  const upd = await prisma.subscription.updateMany({
    where: { id: sub.id, pendingPlan: { not: null }, pendingFrom: { gt: now }, currentPeriodEnd: sub.currentPeriodEnd },
    data: CLEAR_PENDING,
  });
  log("cancel_downgrade", sub.id, upd.count ? "canceled" : "not_scheduled");
  return { ok: true, changed: upd.count > 0, subscription: await getClientSubscription(userId, now) };
}

// Можно ли оплатить личный план targetPlan через Unified Checkout с учётом подписки CyberSource:
//   нет подписки → обычная первая оплата (replacesSubscriptionId=null);
//   Basic → Pro → оплата заменит текущую подписку;
//   тот же план / понижение / недоступно → отказ с текстом для клиента.
export type PersonalCheckoutCheck =
  | { ok: true; replacesSubscriptionId: string | null; upgradeFrom: { plan: string; paidUntil: Date } | null }
  | { ok: false; status: number; message: string };

export async function checkPersonalCheckout(userId: string, targetPlan: string, now: Date = new Date()): Promise<PersonalCheckoutCheck> {
  const sub = await findOwnSubscription(userId, now);
  if (!sub) return { ok: true, replacesSubscriptionId: null, upgradeFrom: null };
  const kind = classifyPlanChange(sub.plan, targetPlan);
  if (kind === "same") return { ok: false, status: 409, message: "Aveți deja acest plan cu reînnoire automată." };
  if (kind === "downgrade") {
    const d = canDowngrade(sub, { now, chargeInFlight: await chargeInFlight(sub.id) });
    if (!d.ok && d.reason !== "ALREADY_SCHEDULED") return { ok: false, status: 409, message: DOWNGRADE_DENIED_TEXT[d.reason] };
    return { ok: false, status: 409, message: "Trecerea la Basic se face din profil, butonul «Treceți la Basic» — fără plată acum." };
  }
  if (kind === "invalid") return { ok: false, status: 409, message: "Aveți deja un abonament cu reînnoire automată." };
  const check = canUpgrade(sub, { now, chargeInFlight: await chargeInFlight(sub.id) });
  if (!check.ok) return { ok: false, status: 409, message: UPGRADE_DENIED_TEXT[check.reason] };
  return { ok: true, replacesSubscriptionId: sub.id, upgradeFrom: { plan: sub.plan, paidUntil: sub.currentPeriodEnd } };
}

// Есть ли у пользователя личная подписка CyberSource (для маршрутизации кнопок оплаты).
export async function hasOwnCsSubscription(userId: string, now: Date = new Date()): Promise<boolean> {
  return !!(await findOwnSubscription(userId, now));
}
