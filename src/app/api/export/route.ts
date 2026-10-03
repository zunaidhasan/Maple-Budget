// GET /api/export — data export (section 4.1, section 9).

import { prisma } from "@/lib/db";
import { withUser } from "@/lib/api";

export async function GET() {
  return withUser(async (user) => {
    const [accounts, transactions, budgets, goals, incomeSources] =
      await Promise.all([
        prisma.financialAccount.findMany({ where: { userId: user.id } }),
        prisma.transaction.findMany({
          where: { userId: user.id },
          orderBy: { date: "asc" },
        }),
        prisma.budget.findMany({
          where: { userId: user.id },
          include: { items: true },
        }),
        prisma.financialGoal.findMany({
          where: { userId: user.id },
          include: { contributions: true },
        }),
        prisma.incomeSource.findMany({ where: { userId: user.id } }),
      ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      user: { email: user.email, displayName: user.displayName },
      accounts,
      transactions,
      budgets,
      goals,
      incomeSources,
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="maple-budget-export.json"`,
      },
    });
  }) as Promise<Response>;
}
