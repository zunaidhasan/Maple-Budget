// Dashboard aggregates (section 4.11). All money values follow the signed
// amount convention: negative = outflow, positive = inflow.

import { prisma } from "./db";
import { activeBudget, computeBudgetSummary } from "./budgets";
import type { CategoryBudgetStatus } from "./budgets";

export interface DashboardSummary {
  netWorth: number;
  liquidFunds: number;
  incomePeriod: number;
  expensesPeriod: number;
  netCashFlow: number;
  periodStart: Date;
  periodEnd: Date;
  budget: {
    id: string;
    name: string;
    utilizationPct: number | null;
    totalAllocation: number;
    totalSpent: number;
    topStatuses: CategoryBudgetStatus[];
  } | null;
  topCategories: { key: string; label: string; color: string; spent: number }[];
  upcomingIncome: {
    id: string;
    name: string;
    expectedAmount: number;
    nextExpectedAt: Date | null;
  }[];
  recurringExpenses: {
    id: string;
    merchantName: string;
    avgAmount: number;
    frequency: string;
    nextExpectedAt: Date | null;
  }[];
  recentTransactions: {
    id: string;
    description: string;
    merchantName: string | null;
    amount: number;
    date: Date;
    categoryName: string | null;
    categoryColor: string | null;
    accountName: string;
  }[];
  syncHealth: {
    connectionId: string;
    institutionName: string;
    status: string;
    lastSuccessfulSyncAt: Date | null;
    lastError: string | null;
  }[];
  needsAttention: string[];
}

function startOfMonth(d = new Date()): Date {
  const s = new Date(d);
  s.setUTCDate(1);
  s.setUTCHours(0, 0, 0, 0);
  return s;
}

function endOfMonth(d = new Date()): Date {
  const e = new Date(d);
  e.setUTCMonth(e.getUTCMonth() + 1, 1);
  e.setUTCHours(0, 0, 0, 0);
  return e;
}

export async function computeDashboard(userId: string): Promise<DashboardSummary> {
  const accounts = await prisma.financialAccount.findMany({
    where: { userId, isClosed: false },
  });

  const netWorth =
    Math.round(accounts.reduce((s, a) => s + Number(a.currentBalance), 0) * 100) / 100;
  const liquidFunds =
    Math.round(
      accounts
        .filter((a) => a.kind === "CHEQUING" || a.kind === "SAVINGS")
        .reduce(
          (s, a) => s + Number(a.availableBalance ?? a.currentBalance),
          0
        ) * 100
    ) / 100;

  const periodStart = startOfMonth();
  const periodEnd = endOfMonth();

  const flowRows = await prisma.transaction.groupBy({
    by: ["type"],
    where: {
      userId,
      date: { gte: periodStart, lt: periodEnd },
      isExcluded: false,
      isTransfer: false,
      status: { not: "REVERSED" },
    },
    _sum: { amount: true },
  });
  const incomePeriod = Math.abs(
    Number(flowRows.find((r) => r.type === "CREDIT")?._sum.amount ?? 0)
  );
  const expensesPeriod = Math.abs(
    Number(flowRows.find((r) => r.type === "DEBIT")?._sum.amount ?? 0)
  );

  // Budget
  const budgetRow = await activeBudget(userId);
  let budgetSummary: DashboardSummary["budget"] = null;
  if (budgetRow) {
    const full = await computeBudgetSummary(budgetRow.id);
    if (full) {
      budgetSummary = {
        id: full.budget.id,
        name: full.budget.name,
        utilizationPct: full.utilizationPct,
        totalAllocation: full.totalAllocation,
        totalSpent: full.totalSpent,
        topStatuses: full.items
          .filter((i) => i.state !== "UNBUDGETED")
          .sort((a, b) => b.utilizationPct! - a.utilizationPct!)
          .slice(0, 4),
      };
    }
  }

  // Top spending categories this period
  const byCat = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      date: { gte: periodStart, lt: periodEnd },
      amount: { lt: 0 },
      isExcluded: false,
      isTransfer: false,
      status: { not: "REVERSED" },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 5,
  });
  const catIds = byCat.map((r) => r.categoryId).filter((x): x is string => !!x);
  const cats = await prisma.transactionCategory.findMany({
    where: { id: { in: catIds } },
  });
  const catById = new Map(cats.map((c) => [c.id, c]));
  const topCategories = byCat
    .filter((r) => r.categoryId)
    .map((r) => {
      const c = catById.get(r.categoryId!)!;
      return {
        key: c.key,
        label: c.label,
        color: c.color,
        spent: Math.abs(Number(r._sum.amount ?? 0)),
      };
    });

  // Upcoming income (next 30 days)
  const upcoming = await prisma.incomeSource.findMany({
    where: {
      userId,
      status: { in: ["ACTIVE", "VARIABLE"] },
      nextExpectedAt: { lte: new Date(Date.now() + 30 * 86_400_000) },
    },
    orderBy: { nextExpectedAt: "asc" },
    take: 5,
  });

  // Recurring expenses
  const recurring = await prisma.recurringPattern.findMany({
    where: {
      userId,
      kind: "EXPENSE",
      status: { in: ["SUGGESTED", "CONFIRMED"] },
    },
    orderBy: { confidence: "desc" },
    take: 5,
  });

  // Recent transactions
  const recent = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 8,
    include: {
      category: true,
      account: true,
    },
  });

  // Sync health
  const connections = await prisma.providerConnection.findMany({
    where: { userId, status: { not: "DISCONNECTED" } },
    include: { institution: true },
  });
  const needsAttention: string[] = [];
  for (const c of connections) {
    if (c.status === "REAUTH_REQUIRED") {
      needsAttention.push(`${c.institution.name} needs re-authentication`);
    } else if (c.status === "ERROR") {
      needsAttention.push(`${c.institution.name} had a sync error`);
    }
    if (
      c.lastSuccessfulSyncAt &&
      Date.now() - c.lastSuccessfulSyncAt.getTime() > 14 * 86_400_000
    ) {
      needsAttention.push(`${c.institution.name} has not synced in 14+ days`);
    }
  }

  return {
    netWorth,
    liquidFunds,
    incomePeriod,
    expensesPeriod,
    netCashFlow: Math.round((incomePeriod - expensesPeriod) * 100) / 100,
    periodStart,
    periodEnd,
    budget: budgetSummary,
    topCategories,
    upcomingIncome: upcoming.map((u) => ({
      id: u.id,
      name: u.name,
      expectedAmount: Number(u.expectedAmount),
      nextExpectedAt: u.nextExpectedAt,
    })),
    recurringExpenses: recurring.map((r) => ({
      id: r.id,
      merchantName: r.merchantName,
      avgAmount: Number(r.avgAmount),
      frequency: r.frequency,
      nextExpectedAt: r.nextExpectedAt,
    })),
    recentTransactions: recent.map((t) => ({
      id: t.id,
      description: t.description,
      merchantName: t.merchantName,
      amount: Number(t.amount),
      date: t.date,
      categoryName: t.category?.label ?? null,
      categoryColor: t.category?.color ?? null,
      accountName: t.account.name,
    })),
    syncHealth: connections.map((c) => ({
      connectionId: c.id,
      institutionName: c.institution.name,
      status: c.status,
      lastSuccessfulSyncAt: c.lastSuccessfulSyncAt,
      lastError: c.lastError,
    })),
    needsAttention,
  };
}
