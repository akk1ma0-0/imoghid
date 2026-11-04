// Удаление токена карты, который больше не нужен (после перехода на новую подписку или по
// окончании подписки). Вызывается ТОЛЬКО после того, как новая подписка уже записана в БД.
// Правила:
//   • токен ещё у живой подписки (ACTIVE / PAST_DUE / отменённой с идущим периодом) — не трогаем;
//   • у того же TMS customer есть другие активные карты (например, новая карта той же подписки) —
//     удаляем только старый payment instrument, иначе удалился бы и новый;
//   • иначе — customer целиком.
// Ошибка удаления ничего не откатывает: пишем операцию и алерт, разбор — админом.
import { prisma } from "@/lib/prisma";
import { deleteCustomer, deletePaymentInstrument } from "@/lib/cybersource/tms";

export type RetireResult = "deleted" | "already_gone" | "in_use" | "not_active" | "error";

export async function retirePaymentMethod(args: {
  paymentMethodId: string;
  paymentId: string | null; // к какой операции привязать запись PaymentOperation
  actorUserId?: string | null;
  now?: Date;
}): Promise<RetireResult> {
  const now = args.now ?? new Date();
  const pm = await prisma.paymentMethod.findUnique({ where: { id: args.paymentMethodId } });
  if (!pm || pm.status !== "ACTIVE") return "not_active";

  const inUse = await prisma.subscription.count({
    where: {
      paymentMethodId: pm.id,
      OR: [
        { status: { in: ["ACTIVE", "PAST_DUE"] } },
        { status: "CANCELED", cancelAtPeriodEnd: true, currentPeriodEnd: { gt: now } },
      ],
    },
  });
  if (inUse > 0) return "in_use";

  const sharedCustomer = await prisma.paymentMethod.count({
    where: { tmsCustomerId: pm.tmsCustomerId, status: "ACTIVE", id: { not: pm.id } },
  });
  const del = sharedCustomer > 0
    ? await deletePaymentInstrument(pm.tmsCustomerId, pm.tmsPaymentInstrumentId)
    : await deleteCustomer(pm.tmsCustomerId);
  const outcome = del.ok ? (del.alreadyGone ? "already_gone" : "deleted") : "error";
  await prisma.paymentOperation.create({
    data: {
      paymentId: args.paymentId,
      type: "TOKEN_DELETE",
      outcome,
      httpStatus: del.ok ? (del.alreadyGone ? 404 : 204) : del.httpStatus,
      actorUserId: args.actorUserId ?? null,
    },
  });
  if (!del.ok) {
    console.error(JSON.stringify({ evt: "cs_token_retire", paymentMethodId: pm.id, alert: "CS_TOKEN_DELETE_FAILED", httpStatus: del.httpStatus }));
    return "error";
  }
  await prisma.paymentMethod.update({ where: { id: pm.id }, data: { status: "REMOVED", removedAt: now } });
  return outcome;
}
