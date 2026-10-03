// GET /api/accounts — list accounts (section 4.3).
// POST /api/accounts — create a manual cash/debt account.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, ok, parseBody, withUser } from "@/lib/api";

const KINDS = [
  "CHEQUING",
  "SAVINGS",
  "CREDIT_CARD",
  "LINE_OF_CREDIT",
  "LOAN",
  "INVESTMENT",
  "CASH",
  "DEBT",
  "OTHER",
] as const;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  kind: z.enum(KINDS),
  currentBalance: z.number(),
  currency: z.string().length(3).default("CAD"),
  mask: z.string().max(4).optional(),
});

export async function GET() {
  return withUser(async (user) => {
    const accounts = await prisma.financialAccount.findMany({
      where: { userId: user.id },
      include: { institution: { select: { name: true, shortName: true } } },
      orderBy: [{ isClosed: "asc" }, { kind: "asc" }, { name: "asc" }],
    });
    return {
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        subtype: a.subtype,
        source: a.source,
        institution: a.institution?.name ?? null,
        currency: a.currency,
        currentBalance: Number(a.currentBalance),
        availableBalance: a.availableBalance ? Number(a.availableBalance) : null,
        creditLimit: a.creditLimit ? Number(a.creditLimit) : null,
        mask: a.mask,
        isClosed: a.isClosed,
        lastSyncedAt: a.lastSyncedAt,
      })),
    };
  });
}

export async function POST(req: Request) {
  try {
    return await withUser(async (user) => {
      const body = await parseBody(req, createSchema);
      const account = await prisma.financialAccount.create({
        data: {
          userId: user.id,
          source: "MANUAL",
          name: body.name,
          kind: body.kind,
          currency: body.currency,
          currentBalance: body.currentBalance,
          mask: body.mask,
        },
      });
      return ok({ id: account.id }, { status: 201 });
    });
  } catch (err) {
    if (err instanceof z.ZodError) return fail(400, "Validation failed");
    throw err;
  }
}
