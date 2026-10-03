// Seed: system transaction categories (idempotent).

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORIES: Array<{
  key: string;
  label: string;
  group: string;
  color: string;
  sortOrder: number;
}> = [
  { key: "income", label: "Income", group: "INCOME", color: "#16a34a", sortOrder: 1 },
  { key: "housing", label: "Housing", group: "EXPENSE", color: "#dc2626", sortOrder: 2 },
  { key: "groceries", label: "Groceries", group: "EXPENSE", color: "#ea580c", sortOrder: 3 },
  { key: "restaurants", label: "Restaurants & Dining", group: "EXPENSE", color: "#d97706", sortOrder: 4 },
  { key: "transportation", label: "Transportation", group: "EXPENSE", color: "#ca8a04", sortOrder: 5 },
  { key: "fuel", label: "Fuel", group: "EXPENSE", color: "#a16207", sortOrder: 6 },
  { key: "utilities", label: "Utilities", group: "EXPENSE", color: "#4d7c0f", sortOrder: 7 },
  { key: "phone", label: "Phone & Internet", group: "EXPENSE", color: "#65a30d", sortOrder: 8 },
  { key: "insurance", label: "Insurance", group: "EXPENSE", color: "#0d9488", sortOrder: 9 },
  { key: "healthcare", label: "Healthcare", group: "EXPENSE", color: "#0891b2", sortOrder: 10 },
  { key: "education", label: "Education", group: "EXPENSE", color: "#2563eb", sortOrder: 11 },
  { key: "childcare", label: "Childcare", group: "EXPENSE", color: "#7c3aed", sortOrder: 12 },
  { key: "shopping", label: "Shopping", group: "EXPENSE", color: "#c026d3", sortOrder: 13 },
  { key: "entertainment", label: "Entertainment", group: "EXPENSE", color: "#db2777", sortOrder: 14 },
  { key: "travel", label: "Travel", group: "EXPENSE", color: "#e11d48", sortOrder: 15 },
  { key: "debt", label: "Debt Repayment", group: "EXPENSE", color: "#9f1239", sortOrder: 16 },
  { key: "savings", label: "Savings & Investments", group: "SAVINGS", color: "#0f766e", sortOrder: 17 },
  { key: "fees", label: "Bank Fees", group: "EXPENSE", color: "#57534e", sortOrder: 18 },
  { key: "transfers", label: "Transfers", group: "TRANSFER", color: "#64748b", sortOrder: 19 },
  { key: "taxes", label: "Taxes", group: "EXPENSE", color: "#7c2d12", sortOrder: 20 },
  { key: "other", label: "Other", group: "EXPENSE", color: "#6b7280", sortOrder: 21 },
];

async function main() {
  for (const cat of CATEGORIES) {
    await prisma.transactionCategory.upsert({
      where: { key: cat.key },
      create: { ...cat, isSystem: true },
      update: { label: cat.label, group: cat.group, color: cat.color, sortOrder: cat.sortOrder },
    });
  }
  console.log(`Seeded ${CATEGORIES.length} system categories.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
