// PATCH /api/budgets/:id — update allocations (section 4.9: editing does not
// lose historical budget records; each Budget row is its own period).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, ok, parseBody, withUser } from "@/lib/api";
import { ensureCategories } from "@/lib/categories";

const schema = z.object({
  name: z.string().min(1).max(100).optional(),
  items: z
    .array(
      z.object({
        categoryKey: z.string(),
        amount: z.number().nonnegative(),
        rollover: z.boolean().optional(),
      })
    )
    .optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    return await withUser(async (user) => {
      const budget = await prisma.budget.findFirst({
        where: { id, userId: user.id },
      });
      if (!budget) return fail(404, "Budget not found");

      const body = await parseBody(req, schema);

      if (body.name) {
        await prisma.budget.update({
          where: { id: budget.id },
          data: { name: body.name },
        });
      }

      if (body.items) {
        const catMap = await ensureCategories(user.id);
        for (const item of body.items) {
          const categoryId = catMap.get(item.categoryKey);
          if (!categoryId) continue;
          await prisma.budgetItem.upsert({
            where: { budgetId_categoryId: { budgetId: budget.id, categoryId } },
            create: {
              budgetId: budget.id,
              categoryId,
              amount: item.amount,
              rollover: item.rollover ?? false,
            },
            update: {
              amount: item.amount,
              ...(item.rollover !== undefined ? { rollover: item.rollover } : {}),
            },
          });
        }
      }

      return ok({ success: true });
    });
  } catch (err) {
    if (err instanceof z.ZodError) return fail(400, "Validation failed");
    throw err;
  }
}
