// PATCH /api/recurring-income/:id — confirm/edit/reject (section 4.8).
// Confirming also creates/updates a linked IncomeSource.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, ok, parseBody, withUser } from "@/lib/api";

const schema = z.object({
  action: z.enum(["confirm", "reject", "disable", "edit"]),
  name: z.string().max(100).optional(),
  expectedAmount: z.number().positive().optional(),
  frequency: z
    .enum(["WEEKLY", "BIWEEKLY", "SEMIMONTHLY", "MONTHLY", "QUARTERLY", "VARIABLE"])
    .optional(),
  nextExpectedAt: z.string().datetime().optional(),
  isVariable: z.boolean().optional(),
});

function nextDateFor(freq: string, from = new Date()): Date {
  const d = new Date(from);
  switch (freq) {
    case "WEEKLY":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "BIWEEKLY":
      d.setUTCDate(d.getUTCDate() + 14);
      break;
    case "SEMIMONTHLY": {
      d.setUTCDate(d.getUTCDate() + 15);
      break;
    }
    case "MONTHLY":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "QUARTERLY":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    default:
      d.setUTCDate(d.getUTCDate() + 14);
  }
  return d;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    return await withUser(async (user) => {
      const pattern = await prisma.recurringPattern.findFirst({
        where: { id, userId: user.id, kind: "INCOME" },
      });
      if (!pattern) return fail(404, "Pattern not found");

      const body = await parseBody(req, schema);

      if (body.action === "reject") {
        await prisma.recurringPattern.update({
          where: { id: pattern.id },
          data: { status: "REJECTED" },
        });
        return ok({ status: "REJECTED" });
      }

      if (body.action === "disable") {
        await prisma.recurringPattern.update({
          where: { id: pattern.id },
          data: { status: "DISABLED" },
        });
        await prisma.incomeSource.updateMany({
          where: { patternId: pattern.id },
          data: { status: "PAUSED" },
        });
        return ok({ status: "DISABLED" });
      }

      const frequency = body.frequency ?? pattern.frequency;
      const amount = body.expectedAmount ?? Number(pattern.avgAmount);
      const nextExpectedAt = body.nextExpectedAt
        ? new Date(body.nextExpectedAt)
        : nextDateFor(frequency, pattern.lastSeenAt ?? new Date());

      if (body.action === "edit") {
        const updated = await prisma.recurringPattern.update({
          where: { id: pattern.id },
          data: {
            frequency,
            avgAmount: amount,
            nextExpectedAt,
          },
        });
        await prisma.incomeSource.updateMany({
          where: { patternId: pattern.id },
          data: {
            expectedAmount: amount,
            frequency,
            nextExpectedAt,
            ...(body.name ? { name: body.name } : {}),
            ...(body.isVariable !== undefined ? { isVariable: body.isVariable } : {}),
          },
        });
        return ok({ status: updated.status });
      }

      // confirm -> ensure IncomeSource exists
      await prisma.recurringPattern.update({
        where: { id: pattern.id },
        data: { status: "CONFIRMED", nextExpectedAt },
      });
      const name = body.name ?? pattern.merchantName;
      const existingSource = await prisma.incomeSource.findFirst({
        where: { patternId: pattern.id },
      });
      if (existingSource) {
        await prisma.incomeSource.update({
          where: { id: existingSource.id },
          data: {
            name,
            expectedAmount: amount,
            frequency,
            nextExpectedAt,
            status: "ACTIVE",
            ...(body.isVariable !== undefined ? { isVariable: body.isVariable } : {}),
          },
        });
      } else {
        await prisma.incomeSource.create({
          data: {
            userId: user.id,
            patternId: pattern.id,
            name,
            kind: "OTHER",
            expectedAmount: amount,
            frequency,
            nextExpectedAt,
            isVariable: body.isVariable ?? false,
          },
        });
      }
      return ok({ status: "CONFIRMED" });
    });
  } catch (err) {
    if (err instanceof z.ZodError) return fail(400, "Validation failed");
    throw err;
  }
}
