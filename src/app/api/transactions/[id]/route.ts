// PATCH /api/transactions/:id — recategorize, note, exclude (section 8).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, ok, parseBody, withUser } from "@/lib/api";

const schema = z.object({
  categoryId: z.string().min(1).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  isExcluded: z.boolean().optional(),
  isTransfer: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    return await withUser(async (user) => {
      const tx = await prisma.transaction.findFirst({
        where: { id, userId: user.id },
      });
      if (!tx) return fail(404, "Transaction not found");

      const body = await parseBody(req, schema);

      // "Always categorize this merchant as…" (section 4.7): when the user
      // changes a category, remember it as a personal merchant rule.
      let createdRule = false;
      if (body.categoryId) {
        const merchant = tx.merchantName ?? tx.description;
        const existing = await prisma.merchantRule.findFirst({
          where: { userId: user.id, pattern: merchant.toLowerCase() },
        });
        if (!existing) {
          await prisma.merchantRule.create({
            data: {
              userId: user.id,
              matchType: "CONTAINS",
              pattern: merchant.toLowerCase().slice(0, 80),
              categoryId: body.categoryId,
              priority: 10,
            },
          });
          createdRule = true;
        }
      }

      const updated = await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          ...(body.categoryId !== undefined
            ? { categoryId: body.categoryId, categorization: "USER" }
            : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.isExcluded !== undefined ? { isExcluded: body.isExcluded } : {}),
          ...(body.isTransfer !== undefined ? { isTransfer: body.isTransfer } : {}),
        },
      });
      return ok({ id: updated.id, categorization: updated.categorization, merchantRuleCreated: createdRule });
    });
  } catch (err) {
    if (err instanceof z.ZodError) return fail(400, "Validation failed");
    throw err;
  }
}
