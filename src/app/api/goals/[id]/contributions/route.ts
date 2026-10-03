// POST /api/goals/:id/contributions — add contribution (section 4.10).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, ok, parseBody, withUser } from "@/lib/api";
import { notify } from "@/lib/notifications";
import { computeGoalProgress } from "@/lib/goals";

const schema = z.object({
  amount: z.number().positive(),
  date: z.string().datetime().optional(),
  note: z.string().max(300).optional(),
  transactionId: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    return await withUser(async (user) => {
      const goal = await prisma.financialGoal.findFirst({
        where: { id, userId: user.id },
      });
      if (!goal) return fail(404, "Goal not found");

      const body = await parseBody(req, schema);

      const contribution = await prisma.goalContribution.create({
        data: {
          goalId: goal.id,
          amount: body.amount,
          date: body.date ? new Date(body.date) : new Date(),
          source: body.transactionId ? "AUTO_MATCHED" : "MANUAL",
          transactionId: body.transactionId,
          note: body.note,
        },
      });

      const updated = await prisma.financialGoal.update({
        where: { id: goal.id },
        data: { currentAmount: { increment: body.amount } },
      });

      const progress = computeGoalProgress(updated);
      if (progress.progressPct >= 100 && goal.status === "ACTIVE") {
        await prisma.financialGoal.update({
          where: { id: goal.id },
          data: { status: "COMPLETED" },
        });
        await notify({
          userId: user.id,
          type: "GOAL_MILESTONE",
          title: `Goal reached: ${goal.title}`,
          body: `Congratulations — ${goal.title} reached its target.`,
        });
      }

      return ok({ contributionId: contribution.id, currentAmount: Number(updated.currentAmount) }, { status: 201 });
    });
  } catch (err) {
    if (err instanceof z.ZodError) return fail(400, "Validation failed");
    throw err;
  }
}
