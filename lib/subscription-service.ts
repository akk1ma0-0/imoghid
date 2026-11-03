// Управление подпиской CyberSource для клиента (БД). Правила — lib/subscription-rules.ts.
// Подписки VictoriaBank сюда не попадают: берём только provider CYBERSOURCE, kind PERSONAL.
import { prisma } from "@/lib/prisma";
import { chargeDueFor } from "@/lib/billing-period";
import { canCancel, canResume, toClientView, type ClientSubscriptionView } from "@/lib/subscription-rules";

const include = { paymentMethod: true } as const;

// Текущая подписка владельца: ACTIVE / PAST_DUE или отменённая, у которой период ещё идёт.
export async function findOwnSubscription(userId: string, now: Date = new Date()) {
  return prisma.subscription.findFirst({
    where: {
      userId,
      provider: "CYBERSOURCE",
      kind: "PERSONAL",
      OR: [
        { status: { in: ["ACTIVE", "PAST_DUE"] } },
        { status: "CANCELED", cancelAtPeriodEnd: true, currentPeriodEnd: { gt: now } },
      ],
    },
    orderBy: { createdAt: "desc" },
    include,
  });
}

async function lastFailureAt(subscriptionId: string): Promise<Date | null> {
  const p = await prisma.payment.findFirst({
    where: { subscriptionId, initiator: "MERCHANT", status: "FAILED" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return p?.createdAt ?? null;
}

export async function getClientSubscription(userId: string, now: Date = new Date()): Promise<ClientSubscriptionView | null> {
  const sub = await findOwnSubscription(userId, now);
  if (!sub) return null;
  return toClientView(sub, sub.paymentMethod, now, await lastFailureAt(sub.id));
}

export type ActionResult =
  | { ok: true; changed: boolean; subscription: ClientSubscriptionView | null }
  | { ok: false; status: number; message: string };

function log(action: string, subscriptionId: string | null, result: string) {
  console.info(JSON.stringify({ evt: "cs_subscription", action, subscriptionId, result }));
}

// Отмена в конце периода: доступ до конца оплаченного периода, возврата нет, токен остаётся
// до EXPIRED (удаляет биллинг). Повторный вызов — без изменений (changed=false).
export async function cancelOwnSubscription(userId: string, now: Date = new Date()): Promise<ActionResult> {
  const sub = await findOwnSubscription(userId, now);
  if (!sub) return { ok: false, status: 404, message: "Nu aveți un abonament cu reînnoire automată." };
  if (!canCancel(sub)) {
    log("cancel", sub.id, "already_canceled");
    return { ok: true, changed: false, subscription: await getClientSubscription(userId, now) };
  }
  const upd = await prisma.subscription.updateMany({
    where: { id: sub.id, cancelAtPeriodEnd: false, status: { in: ["ACTIVE", "PAST_DUE"] } },
    data: { cancelAtPeriodEnd: true, canceledAt: now },
  });
  log("cancel", sub.id, upd.count ? "canceled" : "already_canceled");
  return { ok: true, changed: upd.count > 0, subscription: await getClientSubscription(userId, now) };
}

const RESUME_TEXT = {
  ENDED: "Abonamentul s-a încheiat și nu mai poate fi reluat. Puteți alege din nou un plan.",
  NO_CARD: "Cardul salvat nu mai este disponibil. Pentru a continua, alegeți din nou un plan.",
} as const;

// Возобновление до конца оплаченного периода; после EXPIRED или без токена — нельзя.
export async function resumeOwnSubscription(userId: string, now: Date = new Date()): Promise<ActionResult> {
  const sub = await findOwnSubscription(userId, now);
  if (!sub) return { ok: false, status: 409, message: RESUME_TEXT.ENDED };
  const check = canResume(sub, sub.paymentMethod, now);
  if (!check.ok) {
    if (check.reason === "NOT_CANCELED") {
      log("resume", sub.id, "already_active");
      return { ok: true, changed: false, subscription: await getClientSubscription(userId, now) };
    }
    log("resume", sub.id, `refused_${check.reason}`);
    return { ok: false, status: 409, message: RESUME_TEXT[check.reason] };
  }
  const upd = await prisma.subscription.updateMany({
    where: { id: sub.id, cancelAtPeriodEnd: true, currentPeriodEnd: { gt: now }, status: { in: ["ACTIVE", "PAST_DUE", "CANCELED"] } },
    data: {
      cancelAtPeriodEnd: false,
      canceledAt: null,
      ...(sub.status === "CANCELED" ? { status: "ACTIVE" as const } : {}),
      ...(sub.nextChargeAt ? {} : { nextChargeAt: chargeDueFor(sub.currentPeriodEnd) }),
    },
  });
  log("resume", sub.id, upd.count ? "resumed" : "already_active");
  return { ok: true, changed: upd.count > 0, subscription: await getClientSubscription(userId, now) };
}
