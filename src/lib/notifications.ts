// In-app notification creation (section 4.12). Browser push is a later-phase
// option and always requires explicit user permission.

import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

export async function notify(input: {
  userId: string;
  type:
    | "CONNECTION_ISSUE"
    | "SYNC_FAILED"
    | "NEW_TRANSACTIONS"
    | "BUDGET_THRESHOLD"
    | "INCOME_EXPECTED"
    | "GOAL_MILESTONE"
    | "GOAL_BEHIND"
    | "STALE_SYNC"
    | "SYSTEM";
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  // Respect user preferences where they exist.
  const settings = await prisma.userSettings.findUnique({
    where: { userId: input.userId },
  });
  if (settings) {
    const prefs: Record<string, boolean> = {
      CONNECTION_ISSUE: settings.notifyConnectionIssues,
      SYNC_FAILED: settings.notifySyncFailures,
      NEW_TRANSACTIONS: settings.notifyNewTransactions,
      BUDGET_THRESHOLD: settings.notifyBudgetThresholds,
      INCOME_EXPECTED: settings.notifyIncomeExpected,
      GOAL_MILESTONE: settings.notifyGoals,
      GOAL_BEHIND: settings.notifyGoals,
      STALE_SYNC: settings.notifySyncFailures,
    };
    if (prefs[input.type] === false) return;
  }

  // Dedupe: skip identical unread notification in the last 24h.
  const recent = await prisma.notification.findFirst({
    where: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      readAt: null,
      createdAt: { gte: new Date(Date.now() - 86_400_000) },
    },
  });
  if (recent) return;

  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data as Prisma.InputJsonValue | undefined,
    },
  });
}

/** Evaluate budget thresholds and emit notifications. Called by worker. */
export async function evaluateBudgetNotifications(userId: string): Promise<void> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
  });
  const warn = settings?.budgetWarningThreshold ?? 75;
  const critical = settings?.budgetCriticalThreshold ?? 90;

  const { activeBudget, computeBudgetSummary } = await import("./budgets");
  const budgetRow = await activeBudget(userId);
  if (!budgetRow) return;
  const summary = await computeBudgetSummary(budgetRow.id, warn, critical);
  if (!summary) return;

  for (const item of summary.items) {
    if (item.state === "WARNING" || item.state === "CRITICAL" || item.state === "OVER") {
      await notify({
        userId,
        type: "BUDGET_THRESHOLD",
        title: `Budget: ${item.label}`,
        body:
          item.state === "OVER"
            ? `You've exceeded your ${item.label} budget (${item.spent.toFixed(2)} of ${item.allocation.toFixed(2)} CAD).`
            : `${item.label} budget is at ${item.utilizationPct}% (${item.spent.toFixed(2)} of ${item.allocation.toFixed(2)} CAD).`,
        data: { budgetId: budgetRow.id, categoryId: item.categoryId, state: item.state },
      });
    }
  }
}

/** Check income sources and notify when a payment is expected within 3 days. */
export async function evaluateIncomeNotifications(userId: string): Promise<void> {
  const sources = await prisma.incomeSource.findMany({
    where: {
      userId,
      status: { in: ["ACTIVE", "VARIABLE"] },
      nextExpectedAt: {
        gte: new Date(),
        lte: new Date(Date.now() + 3 * 86_400_000),
      },
    },
  });
  for (const s of sources) {
    await notify({
      userId,
      type: "INCOME_EXPECTED",
      title: "Income expected soon",
      body: `${s.name} (${Number(s.expectedAmount).toFixed(2)} CAD) is expected ${s.nextExpectedAt?.toISOString().slice(0, 10)}.`,
      data: { incomeSourceId: s.id },
    });
  }
}

/** Check goals for milestones and behind-schedule states. */
export async function evaluateGoalNotifications(userId: string): Promise<void> {
  const goals = await prisma.financialGoal.findMany({
    where: { userId, status: "ACTIVE" },
  });
  const { computeGoalProgress, goalMilestone } = await import("./goals");
  for (const goal of goals) {
    const p = computeGoalProgress(goal);
    const milestone = goalMilestone(p.progressPct);
    if (milestone === 100) {
      await prisma.financialGoal.update({
        where: { id: goal.id },
        data: { status: "COMPLETED" },
      });
      await notify({
        userId,
        type: "GOAL_MILESTONE",
        title: `Goal reached: ${goal.title}`,
        body: `Congratulations — you reached your ${goal.title} target.`,
        data: { goalId: goal.id },
      });
    } else if (p.behindSchedule) {
      await notify({
        userId,
        type: "GOAL_BEHIND",
        title: `Goal behind: ${goal.title}`,
        body: `${goal.title} is at ${p.progressPct}% — you may need to increase contributions to stay on track.`,
        data: { goalId: goal.id },
      });
    }
  }
}
