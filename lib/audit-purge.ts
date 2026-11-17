// Очистка журналов старше AUDIT_RETENTION_MONTHS (12 мес.). Каждая таблица — в своём try:
// сбой одной очистки не должен пропускать другую и не ломает сам cron.
import { AUDIT_RETENTION_MONTHS } from "@/lib/audit-config";
import { prisma } from "@/lib/prisma";

export type Purger = (cutoff: Date) => Promise<number>;

const defaultPurgers: { name: string; run: Purger }[] = [
  { name: "audit_events", run: async (c) => (await prisma.auditEvent.deleteMany({ where: { createdAt: { lt: c } } })).count },
  { name: "usage_events", run: async (c) => (await prisma.usageEvent.deleteMany({ where: { createdAt: { lt: c } } })).count },
];

export function retentionCutoff(now: Date = new Date()): Date {
  const c = new Date(now);
  c.setMonth(c.getMonth() - AUDIT_RETENTION_MONTHS);
  return c;
}

export async function purgeAuditJournals(
  now: Date = new Date(),
  purgers: { name: string; run: Purger }[] = defaultPurgers,
): Promise<Record<string, number>> {
  const cutoff = retentionCutoff(now);
  const out: Record<string, number> = {};
  for (const p of purgers) {
    try {
      out[p.name] = await p.run(cutoff);
    } catch (e) {
      out[p.name] = -1; // -1 = не удалось (сбой логируется, остальные таблицы продолжают)
      console.error(`[cron] reset-usage: ${p.name} purge failed`, e instanceof Error ? e.message : e);
    }
  }
  return out;
}
