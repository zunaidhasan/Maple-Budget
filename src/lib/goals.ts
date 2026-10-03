// Goal math (section 4.10).
//
// Required Periodic Contribution =
//   (Target Amount - Current Amount) / Remaining Contribution Periods
//
// This is a planning estimate only — clearly labelled as such in the UI,
// not financial advice.

import type { FinancialGoal, Frequency } from "@prisma/client";

export interface GoalProgress {
  progressPct: number;
  remaining: number;
  periodsRemaining: number | null;
  requiredPerPeriod: number | null;
  behindSchedule: boolean;
  projectedCompleteAt: Date | null;
}

const PERIODS_PER_YEAR: Partial<Record<Frequency, number>> = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  SEMIMONTHLY: 24,
  MONTHLY: 12,
  QUARTERLY: 4,
};

function periodsPerYear(freq?: Frequency | null): number | null {
  if (!freq) return null;
  return PERIODS_PER_YEAR[freq] ?? null;
}

export function computeGoalProgress(
  goal: Pick<
    FinancialGoal,
    | "targetAmount"
    | "currentAmount"
    | "targetDate"
    | "contributionFrequency"
    | "status"
  >
): GoalProgress {
  const target = Number(goal.targetAmount);
  const current = Number(goal.currentAmount);
  const remaining = Math.max(0, Math.round((target - current) * 100) / 100);
  const progressPct =
    target > 0 ? Math.min(100, Math.round((current / target) * 1000) / 10) : 0;

  const ppy = periodsPerYear(goal.contributionFrequency);

  let periodsRemaining: number | null = null;
  let requiredPerPeriod: number | null = null;
  let projectedCompleteAt: Date | null = null;

  if (goal.targetDate && ppy) {
    const daysLeft = Math.max(
      0,
      (goal.targetDate.getTime() - Date.now()) / 86_400_000
    );
    periodsRemaining = Math.max(1, Math.round((daysLeft / 365) * ppy));
    requiredPerPeriod =
      periodsRemaining > 0
        ? Math.ceil((remaining / periodsRemaining) * 100) / 100
        : remaining;
    projectedCompleteAt = goal.targetDate;
  } else if (ppy && remaining > 0) {
    // No target date: project completion assuming the periodic amount.
    projectedCompleteAt = null;
  }

  // Behind schedule: progress % is meaningfully below elapsed-time %
  // toward the target date.
  let behindSchedule = false;
  if (goal.targetDate && goal.status === "ACTIVE") {
    const totalSpan = 365; // unknown start; conservative check vs elapsed
    const daysLeft = Math.max(
      0,
      (goal.targetDate.getTime() - Date.now()) / 86_400_000
    );
    const elapsedPct = Math.min(
      100,
      ((totalSpan - Math.min(daysLeft, totalSpan)) / totalSpan) * 100
    );
    behindSchedule = progressPct + 15 < elapsedPct; // 15pt grace
  }

  return {
    progressPct,
    remaining,
    periodsRemaining,
    requiredPerPeriod,
    behindSchedule,
    projectedCompleteAt,
  };
}

export function goalMilestone(progressPct: number): number | null {
  const milestones = [25, 50, 75, 100];
  for (const m of milestones) {
    if (progressPct >= m) return m;
  }
  return null;
}
