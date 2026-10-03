// Budget calculations (section 4.9).
//
// Budget Remaining = Budget Allocation - Categorized Spending
// Budget Utilization = Categorized Spending / Budget Allocation × 100
//
// Transfers, savings, income, and excluded transactions never count as
// spending. Categories with no allocation surface as "unbudgeted" spending
// instead of a division-by-zero state.

import { prisma } from "./db";
import type { Budget } from "@prisma/client";

export interface CategoryBudgetStatus {
  categoryId: string;
  categoryKey: string;
  label: string;
  color: string;
  allocation: number;
  spent: number;
  remaining: number;
  utilizationPct: number | null; // null when no allocation (unbudgeted)
  state: "OK" | "WARNING" | "CRITICAL" | "OVER" | "UNBUDGETED";
}

export interface BudgetSummary {
  budget: Budget;
  totalAllocation: number;
  totalSpent: number;
  totalRemaining: number;
  utilizationPct: number | null;
  items: CategoryBudgetStatus[];
}

export function utilizationPct(
  spent: number,
  allocation: number
): number | null {
  if (allocation <= 0) return null; // no divide-by-zero
  return Math.round((spent / allocation) * 1000) / 10;
}

export function budgetState(
  pct: number | null,
  warnThreshold: number,
  criticalThreshold: number
): CategoryBudgetStatus["state"] {
  if (pct === null) return "UNBUDGETED";
  if (pct >= 100) return "OVER";
  if (pct >= criticalThreshold) return "CRITICAL";
  if (pct >= warnThreshold) return "WARNING";
  return "OK";
}

/** Spending by category for a date range. Excludes transfers/savings/income/excluded. */
export async function spendingByCategory(
  userId: string,
  start: Date,
  end: Date
): Promise<Map<string, number>> {
  const rows = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      date: { gte: start, lt: end },
      amount: { lt: 0 }, // outflows only
      isExcluded: false,
      isTransfer: false,
      status: { not: "REVERSED" },
    },
    _sum: { amount: true },
  });

  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.categoryId) {
      out.set(r.categoryId, Math.abs(Number(r._sum?.amount ?? 0)));
    }
  }
  return out;
}

export async function computeBudgetSummary(
  budgetId: string,
  warnThreshold = 75,
  criticalThreshold = 90
): Promise<BudgetSummary | null> {
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    include: {
      items: { include: { category: true } },
    },
  });
  if (!budget) return null;

  const spentMap = await spendingByCategory(
    budget.userId,
    budget.startDate,
    budget.endDate
  );

  const items: CategoryBudgetStatus[] = budget.items.map((item) => {
    const allocation = Number(item.amount);
    const spent = spentMap.get(item.categoryId) ?? 0;
    const pct = utilizationPct(spent, allocation);
    return {
      categoryId: item.categoryId,
      categoryKey: item.category.key,
      label: item.category.label,
      color: item.category.color,
      allocation,
      spent,
      remaining: Math.round((allocation - spent) * 100) / 100,
      utilizationPct: pct,
      state: budgetState(pct, warnThreshold, criticalThreshold),
    };
  });

  // Unbudgeted spending: categories with outflows but no allocation row.
  const allocated = new Set(budget.items.map((i) => i.categoryId));
  for (const [categoryId, spent] of spentMap) {
    if (allocated.has(categoryId)) continue;
    const cat = await prisma.transactionCategory.findUnique({
      where: { id: categoryId },
    });
    if (!cat || cat.group !== "EXPENSE") continue;
    items.push({
      categoryId,
      categoryKey: cat.key,
      label: cat.label,
      color: cat.color,
      allocation: 0,
      spent,
      remaining: -spent,
      utilizationPct: null,
      state: "UNBUDGETED",
    });
  }

  items.sort((a, b) => b.spent - a.spent);

  const totalAllocation = items.reduce((s, i) => s + i.allocation, 0);
  const totalSpent = items.reduce((s, i) => s + i.spent, 0);

  return {
    budget,
    totalAllocation: Math.round(totalAllocation * 100) / 100,
    totalSpent: Math.round(totalSpent * 100) / 100,
    totalRemaining: Math.round((totalAllocation - totalSpent) * 100) / 100,
    utilizationPct: utilizationPct(totalSpent, totalAllocation),
    items,
  };
}

/** Resolve the active budget for a user on a given date. */
export async function activeBudget(
  userId: string,
  on: Date = new Date()
): Promise<Budget | null> {
  return prisma.budget.findFirst({
    where: { userId, startDate: { lte: on }, endDate: { gte: on } },
    orderBy: { startDate: "desc" },
  });
}

/** Budget period bounds for a period type anchored at a date. */
export function periodBounds(
  period: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "CUSTOM",
  anchor: Date,
  firstDayOfWeek = 0
): { start: Date; end: Date } {
  const start = new Date(anchor);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);

  if (period === "WEEKLY") {
    const dow = (start.getUTCDay() - firstDayOfWeek + 7) % 7;
    start.setUTCDate(start.getUTCDate() - dow);
    end.setTime(start.getTime());
    end.setUTCDate(end.getUTCDate() + 7);
  } else if (period === "BIWEEKLY") {
    const dow = (start.getUTCDay() - firstDayOfWeek + 7) % 7;
    start.setUTCDate(start.getUTCDate() - dow);
    end.setTime(start.getTime());
    end.setUTCDate(end.getUTCDate() + 14);
  } else if (period === "MONTHLY") {
    start.setUTCDate(1);
    end.setTime(start.getTime());
    end.setUTCMonth(end.getUTCMonth() + 1);
  } else {
    end.setUTCDate(end.getUTCDate() + 30); // CUSTOM default 30d
  }
  return { start, end };
}
