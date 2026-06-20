import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { stepToNumber } from "@/lib/steps";
import { effectiveUsed } from "@/lib/analysis-limits";
import {
  startOfMonth,
  tokensCostUsd,
  EST_ANALYSIS_TOKENS,
} from "@/lib/admin-stats";
import { AdminPanel } from "./AdminPanel";

// Серверный гард: панель доступна ТОЛЬКО роли ADMIN.
// Для всех остальных — notFound() (404), чтобы не раскрывать существование панели.
export default async function AdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    notFound();
  }

  const now = new Date();
  const monthStart = startOfMonth(now);

  const [users, activeDeals, anuntThisMonth, txRows] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        role: true,
        isBlocked: true,
        createdAt: true,
        analysisCount: true,
        analysisCountResetAt: true,
        _count: { select: { transactions: true } },
      },
    }),
    prisma.transaction.count({ where: { status: "ACTIVE" } }),
    prisma.anuntGeneration.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { inputTokens: true, outputTokens: true },
    }),
    prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        address: true,
        dealType: true,
        status: true,
        currentStep: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
    }),
  ]);

  // ── Статистика Claude API за текущий месяц ──
  const anuntCount = anuntThisMonth.length;
  const anuntIn = anuntThisMonth.reduce((s, a) => s + (a.inputTokens ?? 0), 0);
  const anuntOut = anuntThisMonth.reduce((s, a) => s + (a.outputTokens ?? 0), 0);
  const anuntCost = tokensCostUsd(anuntIn, anuntOut);

  // Анализы документов (Step 3): счётчик с месячным сбросом, без потокенного лога.
  const analysisCount = users.reduce((s, u) => s + effectiveUsed(u, now), 0);
  const analysisCostEst = tokensCostUsd(
    analysisCount * EST_ANALYSIS_TOKENS.input,
    analysisCount * EST_ANALYSIS_TOKENS.output,
  );

  const stats = {
    totalUsers: users.length,
    activeDeals,
    totalTransactions: txRows.length,
    claudeCalls: anuntCount + analysisCount,
    anuntCount,
    analysisCount,
    anuntCost,
    analysisCostEst,
    totalCost: anuntCost + analysisCostEst,
  };

  const usersOut = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    plan: u.plan,
    role: u.role,
    isBlocked: u.isBlocked,
    createdAt: u.createdAt.toISOString(),
    transactionCount: u._count.transactions,
    analysisUsed: effectiveUsed(u, now),
  }));

  const transactionsOut = txRows.map((t) => ({
    id: t.id,
    address: t.address,
    dealType: t.dealType,
    status: t.status,
    step: stepToNumber(t.currentStep),
    createdAt: t.createdAt.toISOString(),
    agentId: t.user.id,
    agentLabel: t.user.name || t.user.email,
  }));

  return (
    <AdminPanel
      currentUserId={session.user.id}
      users={usersOut}
      transactions={transactionsOut}
      stats={stats}
    />
  );
}
