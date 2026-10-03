// Budget (section 4.9) — current budget + create form.

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeBudgetSummary } from "@/lib/budgets";
import { Card, CardTitle, cad, ProgressBar, EmptyState, Badge } from "@/components/ui";
import { BudgetEditor } from "@/components/budget-editor";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const user = await requireUser();

  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
  });
  const latest = await prisma.budget.findFirst({
    where: { userId: user.id },
    orderBy: { startDate: "desc" },
  });
  const summary = latest
    ? await computeBudgetSummary(
        latest.id,
        settings?.budgetWarningThreshold ?? 75,
        settings?.budgetCriticalThreshold ?? 90
      )
    : null;

  const categories = await prisma.transactionCategory.findMany({
    where: { group: "EXPENSE", isSystem: true },
    orderBy: { sortOrder: "asc" },
    select: { key: true, label: true },
  });

  return (
    <div className="space-y-4">
      {summary ? (
        <Card>
          <CardTitle
            action={
              <Badge tone={summary.utilizationPct != null && summary.utilizationPct >= 100 ? "danger" : "default"}>
                {summary.budget.period.toLowerCase()}
              </Badge>
            }
          >
            {summary.budget.name}
          </CardTitle>
          <div className="mb-4">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold">{cad(summary.totalSpent)}</span>
              <span className="text-sm text-(--muted)">
                of {cad(summary.totalAllocation)} ·{" "}
                {summary.utilizationPct != null ? `${summary.utilizationPct}%` : "—"}
              </span>
            </div>
            <div className="mt-2">
              <ProgressBar pct={summary.utilizationPct ?? 0} />
            </div>
            <p className="mt-1 text-xs text-(--muted)">
              Remaining: {cad(summary.totalRemaining)} · transfers and savings
              excluded
            </p>
          </div>

          <ul className="space-y-3">
            {summary.items.map((item) => (
              <li key={item.categoryId}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-(--muted)">
                    {cad(item.spent)}
                    {item.allocation > 0 ? ` / ${cad(item.allocation)}` : " · unbudgeted"}
                    {item.utilizationPct != null ? ` (${item.utilizationPct}%)` : ""}
                  </span>
                </div>
                <ProgressBar
                  pct={item.utilizationPct ?? 0}
                  color={
                    item.state === "OVER" || item.state === "CRITICAL"
                      ? "var(--danger)"
                      : item.state === "WARNING"
                        ? "var(--warning)"
                        : item.color
                  }
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title="No budget yet"
            hint="Allocate monthly targets to your spending categories. Historical budgets are kept forever."
          />
        </Card>
      )}

      <BudgetEditor
        categories={categories}
        existing={
          summary
            ? summary.items
                .filter((i) => i.allocation > 0)
                .map((i) => ({ categoryKey: i.categoryKey, amount: i.allocation }))
            : []
        }
        budgetId={summary?.budget.id ?? null}
      />
    </div>
  );
}
