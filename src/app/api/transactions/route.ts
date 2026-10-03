// GET /api/transactions — filtered listing with pagination (section 8).

import { prisma } from "@/lib/db";
import { withUser } from "@/lib/api";
import type { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  return withUser(async (user) => {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const categoryId = url.searchParams.get("categoryId") ?? "";
    const accountId = url.searchParams.get("accountId") ?? "";
    const type = url.searchParams.get("type") ?? ""; // income | expense | transfer
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const minAmount = url.searchParams.get("minAmount");
    const maxAmount = url.searchParams.get("maxAmount");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") ?? 50)));

    const where: Prisma.TransactionWhereInput = { userId: user.id };
    if (q) {
      where.OR = [
        { description: { contains: q, mode: "insensitive" } },
        { merchantName: { contains: q, mode: "insensitive" } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;
    if (accountId) where.accountId = accountId;
    if (type === "income") where.amount = { gt: 0 };
    if (type === "expense") where.amount = { lt: 0 };
    if (type === "transfer") where.isTransfer = true;
    if (from || to) {
      where.date = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    if (minAmount || maxAmount) {
      where.amount = {
        ...(minAmount ? { lte: -Number(minAmount) } : {}),
        ...(maxAmount ? { gte: -Number(maxAmount) } : {}),
      };
    }

    const [total, rows] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: { select: { key: true, label: true, color: true } },
          account: { select: { name: true, kind: true } },
        },
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      transactions: rows.map((t) => ({
        id: t.id,
        date: t.date,
        description: t.description,
        merchantName: t.merchantName,
        amount: Number(t.amount),
        currency: t.currency,
        type: t.type,
        status: t.status,
        isTransfer: t.isTransfer,
        isExcluded: t.isExcluded,
        notes: t.notes,
        category: t.category,
        account: t.account,
      })),
    };
  });
}
