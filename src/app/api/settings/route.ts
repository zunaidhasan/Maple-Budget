// PATCH /api/settings — update user preferences (section 4.1).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, ok, parseBody, withUser } from "@/lib/api";

const schema = z.object({
  timezone: z.string().max(60).optional(),
  currency: z.string().length(3).optional(),
  language: z.string().max(10).optional(),
  budgetWarningThreshold: z.number().int().min(1).max(99).optional(),
  budgetCriticalThreshold: z.number().int().min(2).max(100).optional(),
  notifyConnectionIssues: z.boolean().optional(),
  notifySyncFailures: z.boolean().optional(),
  notifyNewTransactions: z.boolean().optional(),
  notifyBudgetThresholds: z.boolean().optional(),
  notifyIncomeExpected: z.boolean().optional(),
  notifyGoals: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  try {
    return await withUser(async (user) => {
      const body = await parseBody(req, schema);
      await prisma.userSettings.upsert({
        where: { userId: user.id },
        create: { ...body, userId: user.id },
        update: body,
      });
      return ok({ success: true });
    });
  } catch (err) {
    if (err instanceof z.ZodError) return fail(400, "Validation failed");
    throw err;
  }
}
