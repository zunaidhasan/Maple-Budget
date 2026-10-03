// Transactions (section 4.7) — list, search, filter, recategorize.

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, EmptyState } from "@/components/ui";
import { TransactionsBrowser } from "@/components/transactions-browser";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const user = await requireUser();
  const [accounts, categories] = await Promise.all([
    prisma.financialAccount.findMany({
      where: { userId: user.id, isClosed: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.transactionCategory.findMany({
      where: { OR: [{ isSystem: true }, { userId: user.id }] },
      select: { id: true, label: true, color: true, group: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return (
    <TransactionsBrowser accounts={accounts} categories={categories} />
  );
}
