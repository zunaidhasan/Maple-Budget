// Dashboard (section 4.11) — server-rendered from computeDashboard().

import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { computeDashboard } from "@/lib/aggregates";
import { Card, CardTitle, StatTile, cad, dateShort, Badge, ProgressBar, EmptyState } from "@/components/ui";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const d = await computeDashboard(user.id);

  return (
    <div className="space-y-4">
      {d.needsAttention.length > 0 && (
        <Card className="border-(--warning)">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 text-(--warning)" />
            <div className="text-sm">
              <p className="font-semibold">Connection attention needed</p>
              <ul className="mt-1 list-inside list-disc text-(--muted)">
                {d.needsAttention.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Net worth" value={cad(d.netWorth)} />
        <StatTile label="Available funds" value={cad(d.liquidFunds)} />
        <StatTile
          label="Income (this month)"
          value={cad(d.incomePeriod)}
          tone="positive"
        />
        <StatTile
          label="Spending (this month)"
          value={cad(d.expensesPeriod)}
          tone="negative"
        />
      </div>

      <Card>
        <CardTitle
          action={
            <span className={`text-sm font-semibold ${(d.netCashFlow >= 0 ? "text-emerald-600" : "text-red-600")}`}>
              {cad(d.netCashFlow, { signed: true })}
            </span>
          }
        >
          Net cash flow · {dateShort(d.periodStart)} →
        </CardTitle>
        {d.budget ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{d.budget.name}</span>
              <span className="text-(--muted)">
                {cad(d.budget.totalSpent)} of {cad(d.budget.totalAllocation)}
                {d.budget.utilizationPct != null ? ` · ${d.budget.utilizationPct}%` : ""}
              </span>
            </div>
            {d.budget.topStatuses.map((item) => (
              <div key={item.categoryId}>
                <div className="mb-1 flex justify-between text-xs">
                  <span>{item.label}</span>
                  <span className="text-(--muted)">
                    {item.utilizationPct != null ? `${item.utilizationPct}%` : "unbudgeted"}
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
              </div>
            ))}
            <Link href="/app/budget" className="btn btn-secondary w-full">
              Open budget
            </Link>
          </div>
        ) : (
          <EmptyState
            title="No budget yet"
            hint="Create your first budget to see category progress here."
            action={
              <Link href="/app/budget" className="btn btn-primary">
                Create a budget
              </Link>
            }
          />
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle action={<Link href="/app/income" className="text-xs font-semibold text-(--primary)">Income</Link>}>
            Upcoming income
          </CardTitle>
          {d.upcomingIncome.length === 0 ? (
            <p className="text-sm text-(--muted)">
              No expected income in the next 30 days.
            </p>
          ) : (
            <ul className="space-y-2">
              {d.upcomingIncome.map((i) => (
                <li key={i.id} className="flex items-center justify-between text-sm">
                  <span>
                    {i.name}
                    <span className="block text-xs text-(--muted)">
                      {i.nextExpectedAt ? dateShort(i.nextExpectedAt) : "—"}
                    </span>
                  </span>
                  <span className="font-semibold text-emerald-600">{cad(i.expectedAmount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>Recurring expenses</CardTitle>
          {d.recurringExpenses.length === 0 ? (
            <p className="text-sm text-(--muted)">Not enough history yet.</p>
          ) : (
            <ul className="space-y-2">
              {d.recurringExpenses.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span>
                    {r.merchantName}
                    <span className="block text-xs text-(--muted)">
                      {r.frequency.toLowerCase()} · next {r.nextExpectedAt ? dateShort(r.nextExpectedAt) : "—"}
                    </span>
                  </span>
                  <span className="font-semibold">{cad(r.avgAmount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle
          action={<Badge tone={d.topCategories.length ? "default" : "warning"}>month</Badge>}
        >
          Top categories
        </CardTitle>
        {d.topCategories.length === 0 ? (
          <p className="text-sm text-(--muted)">No spending recorded this month.</p>
        ) : (
          <ul className="space-y-2">
            {d.topCategories.map((c) => (
              <li key={c.key} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                <span className="flex-1">{c.label}</span>
                <span className="font-semibold">{cad(c.spent)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle
          action={<Link href="/app/transactions" className="text-xs font-semibold text-(--primary)">See all</Link>}
        >
          Recent transactions
        </CardTitle>
        {d.recentTransactions.length === 0 ? (
          <p className="text-sm text-(--muted)">
            Connect a bank account to import transactions.
          </p>
        ) : (
          <ul className="divide-y divide-(--border)">
            {d.recentTransactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {t.merchantName ?? t.description}
                  </span>
                  <span className="text-xs text-(--muted)">
                    {t.categoryName ?? "Uncategorized"} · {t.accountName} · {dateShort(t.date)}
                  </span>
                </span>
                <span className={`ml-3 font-semibold ${t.amount >= 0 ? "text-emerald-600" : ""}`}>
                  {cad(t.amount, { signed: true })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
