// GET /api/recurring-income — detected + confirmed income patterns (4.8).

import { prisma } from "@/lib/db";
import { withUser } from "@/lib/api";

export async function GET() {
  return withUser(async (user) => {
    const patterns = await prisma.recurringPattern.findMany({
      where: { userId: user.id, kind: "INCOME", status: { not: "DISABLED" } },
      orderBy: [{ confidence: "desc" }, { lastSeenAt: "desc" }],
    });
    return {
      patterns: patterns.map((p) => ({
        id: p.id,
        status: p.status,
        merchantName: p.merchantName,
        frequency: p.frequency,
        intervalDays: p.intervalDays,
        avgAmount: Number(p.avgAmount),
        amountMin: Number(p.amountMin),
        amountMax: Number(p.amountMax),
        occurrenceCount: p.occurrenceCount,
        confidence: p.confidence,
        firstSeenAt: p.firstSeenAt,
        lastSeenAt: p.lastSeenAt,
        nextExpectedAt: p.nextExpectedAt,
      })),
    };
  });
}
