// GET /api/budgets — list budgets with summaries (section 8).
// POST /api/budgets — create a budget with category allocations.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, ok, parseBody, withUser } from "@/lib/api";
import { computeBudgetSummary, periodBounds } from "@/lib/budgets";
import { ensureCategories } from "@/lib/categories";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  period: z.enum(["WEEKLY", "BIWEEKLY", "SEMIMONTHLY", "MONTHLY", "CUSTOM"]),
  startDate: z.string().optional(), // ISO date; defaults to today's period
  endDate: z.string().optional(), // required for CUSTOM
  items: z
    .array(
      z.object({
        categoryKey: z.string(),
        amount: z.number().nonnegative(),
        rollover: z.boolean().optional(),
      })
    )
    .min(1),
});

export async function GET() {
  return withUser(async (user) => {
    const settings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });
    const budgets = await prisma.budget.findMany({
      where: { userId: user.id },
      orderBy: { startDate: "desc" },
      take: 24,
    });
    const summaries = await Promise.all(
      budgets.map((b) => computeBudgetSummary(
        b.id,
        settings?.budgetWarningThreshold ?? 75,
        settings?.budgetCriticalThreshold ?? 90
      ))
    );
    return { budgets: summaries };
  });
}

export async function POST(req: Request) {
  try {
    return await withUser(async (user) => {
      const body = await parseBody(req, createSchema);

      const bounds =
        body.period === "CUSTOM"
          ? {
              start: new Date(body.startDate ?? new Date().toISOString()),
              end: new Date(body.endDate ?? new Date(Date.now() + 30 * 86_400_000).toISOString()),
            }
          : periodBounds(
              body.period as "WEEKLY" | "BIWEEKLY" | "MONTHLY",
              body.startDate ? new Date(body.startDate) : new Date()
            );

      if (Number.isNaN(bounds.start.getTime()) || Number.isNaN(bounds.end.getTime())) {
        return fail(400, "Invalid budget dates");
      }

      const catMap = await ensureCategories(user.id);
      const itemData = body.items
        .map((i) => ({
          categoryKey: i.categoryKey,
          amount: i.amount,
          rollover: i.rollover ?? false,
        }))
        .filter((i) => catMap.has(i.categoryKey));

      const budget = await prisma.budget.create({
        data: {
          userId: user.id,
          name: body.name,
          period: body.period,
          startDate: bounds.start,
          endDate: bounds.end,
          items: {
            create: itemData.map((i) => ({
              categoryId: catMap.get(i.categoryKey)!,
              amount: i.amount,
              rollover: i.rollover,
            })),
          },
        },
      });
      return ok({ id: budget.id }, { status: 201 });
    });
  } catch (err) {
    if (err instanceof z.ZodError) return fail(400, "Validation failed");
    throw err;
  }
}
