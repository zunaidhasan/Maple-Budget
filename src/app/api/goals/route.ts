// GET /api/goals — list goals with progress (section 8).
// POST /api/goals — create a goal.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, ok, parseBody, withUser } from "@/lib/api";
import { computeGoalProgress } from "@/lib/goals";

const createSchema = z.object({
  title: z.string().min(1).max(100),
  type: z.enum(["EMERGENCY_FUND", "VACATION", "HOME_DOWN_PAYMENT", "CAR", "EDUCATION", "DEBT_PAYOFF", "OTHER"]),
  targetAmount: z.number().positive(),
  currentAmount: z.number().nonnegative().default(0),
  targetDate: z.string().datetime().optional(),
  accountId: z.string().optional(),
  contributionFrequency: z
    .enum(["WEEKLY", "BIWEEKLY", "SEMIMONTHLY", "MONTHLY", "QUARTERLY"])
    .optional(),
  notes: z.string().max(500).optional(),
});

export async function GET() {
  return withUser(async (user) => {
    const goals = await prisma.financialGoal.findMany({
      where: { userId: user.id, status: { not: "ARCHIVED" } },
      include: { account: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return {
      goals: goals.map((g) => {
        const p = computeGoalProgress(g);
        return {
          id: g.id,
          title: g.title,
          type: g.type,
          status: g.status,
          targetAmount: Number(g.targetAmount),
          currentAmount: Number(g.currentAmount),
          targetDate: g.targetDate,
          accountName: g.account?.name ?? null,
          contributionFrequency: g.contributionFrequency,
          notes: g.notes,
          progressPct: p.progressPct,
          remaining: p.remaining,
          periodsRemaining: p.periodsRemaining,
          requiredPerPeriod: p.requiredPerPeriod,
          behindSchedule: p.behindSchedule,
        };
      }),
    };
  });
}

export async function POST(req: Request) {
  try {
    return await withUser(async (user) => {
      const body = await parseBody(req, createSchema);
      if (body.accountId) {
        const acct = await prisma.financialAccount.findFirst({
          where: { id: body.accountId, userId: user.id },
        });
        if (!acct) return fail(400, "Linked account not found");
      }
      const goal = await prisma.financialGoal.create({
        data: {
          userId: user.id,
          title: body.title,
          type: body.type,
          targetAmount: body.targetAmount,
          currentAmount: body.currentAmount,
          targetDate: body.targetDate ? new Date(body.targetDate) : null,
          accountId: body.accountId,
          contributionFrequency: body.contributionFrequency,
          notes: body.notes,
        },
      });
      return ok({ id: goal.id }, { status: 201 });
    });
  } catch (err) {
    if (err instanceof z.ZodError) return fail(400, "Validation failed");
    throw err;
  }
}
