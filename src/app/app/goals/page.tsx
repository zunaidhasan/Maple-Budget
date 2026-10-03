// Goals (section 4.10) — progress tracking + creation + contributions.

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeGoalProgress } from "@/lib/goals";
import { Card, CardTitle, cad, ProgressBar, EmptyState, Badge } from "@/components/ui";
import { GoalEditor } from "@/components/goal-editor";
import { ContributionForm } from "@/components/contribution-form";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const user = await requireUser();
  const goals = await prisma.financialGoal.findMany({
    where: { userId: user.id, status: { not: "ARCHIVED" } },
    include: { account: { select: { name: true } }, contributions: { orderBy: { date: "desc" }, take: 1 } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-4">
      {goals.length === 0 ? (
        <Card>
          <EmptyState
            title="No goals yet"
            hint="Emergency fund, vacation, home down payment — set a target and track your progress."
          />
        </Card>
      ) : (
        goals.map((g) => {
          const p = computeGoalProgress(g);
          return (
            <Card key={g.id}>
              <CardTitle
                action={
                  <Badge tone={g.status === "COMPLETED" ? "success" : p.behindSchedule ? "warning" : "default"}>
                    {g.status === "COMPLETED" ? "completed" : p.behindSchedule ? "behind" : "on track"}
                  </Badge>
                }
              >
                {g.title}
              </CardTitle>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-xl font-bold">
                  {cad(Number(g.currentAmount))}
                </span>
                <span className="text-sm text-(--muted)">
                  of {cad(Number(g.targetAmount))} · {p.progressPct}%
                </span>
              </div>
              <ProgressBar pct={p.progressPct} />
              <div className="mt-2 text-xs text-(--muted)">
                {p.remaining > 0 ? `${cad(p.remaining)} to go` : "Target reached 🎉"}
                {p.requiredPerPeriod != null && (
                  <>
                    {" · "}about {cad(p.requiredPerPeriod)}/{(g.contributionFrequency ?? "MONTHLY").toLowerCase()} needed
                  </>
                )}
                {g.account?.name ? ` · ${g.account.name}` : ""}
              </div>
              <p className="mt-1 text-[11px] text-(--muted)">
                Planning estimate only — not financial advice.
              </p>
              {g.status === "ACTIVE" && <ContributionForm goalId={g.id} />}
            </Card>
          );
        })
      )}

      <GoalEditor />
    </div>
  );
}
