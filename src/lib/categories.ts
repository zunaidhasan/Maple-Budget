// Categorization (section 4.7). Rule-based first pass over normalized
// transactions, with user merchant rules taking priority.

import { prisma } from "./db";
import { extractMerchant, isTransfer } from "./flinks/normalize";
import type { TransactionCategory, MerchantRule } from "@prisma/client";

export interface CategoryDef {
  key: string;
  label: string
  group: "INCOME" | "EXPENSE" | "TRANSFER" | "SAVINGS";
  color: string;
  sortOrder: number;
}

export const SYSTEM_CATEGORIES: CategoryDef[] = [
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

// Keyword rules: first match wins (lower = higher priority).
const RULES: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /loblaws|metro|sobeys|no\s*frills|food\s*basics|freshco|farm\s*boy|provigo|iga|maxi|foodland|costco\s*wholesale|wholesale\s*club/i, category: "groceries" },
  { pattern: /tim\s*h?ortons|starbucks|second\s*cup|restaurant|resto|cafe|mcdonald|harveys|wendy|burger|pizza|pizza\s*pizza|subway|azelea|swiss\s*chalet|st\.?\s*hubert|a&w|timmys|dairy\s*queen|kfc|poke|sushi|nando|skip\s*the\s*dishes|uber\s*eats|doordash|just\s*eat/i, category: "restaurants" },
  { pattern: /presto|ttc|transit|metro\s*pass|go\s*(?:train|bus|transit)/i, category: "transportation" },
  { pattern: /petro-?canada|shell|esso|husky|ultramar|circle\s*k\s*fuel|flying\s*j/i, category: "fuel" },
  { pattern: /enbridge|hydro|electricity|utilit|atco|gas\s*bill|water\s*utility|power\s*bill/i, category: "utilities" },
  { pattern: /bell|rogers|telus|fido|virgin\s*plus|koodo|chatr|freedom\s*mobile|cogeco|videotron|teksavvy|distributel|oxio|internet|wireless|mobility/i, category: "phone" },
  { pattern: /insurance|intact|desjardins\s*insur|aviva|allstate|belair|the\s*personal|sonnet|td\s*insurance|rbc\s*insurance/i, category: "insurance" },
  { pattern: /pharmacy|pharmaprix|shoppers\s*drug|rexall|jean\s*coutu|uniprix|dental|dentist|optometry|optician|clinic|medical|laboratory|life\s*labs|dynacare/i, category: "healthcare" },
  { pattern: /tuition|university|college|school|cours|udemy|coursera/i, category: "education" },
  { pattern: /daycare|childcare|kindergarten|montessori|YMCA\s*child/i, category: "childcare" },
  { pattern: /amazon|ebay|etsy|walmart|canadian\s*tire|home\s*depot|rona|ikea|structube|best\s*buy|apple\.com|apple\s*store|winners|marshalls|home\s*sense|simons|h&m|uniqlo|aritzia|lululemon|sportcheck|sportium|roots|indigo|chapters|bureau\s*en\s*gros|staples|dollar|dollarama|saq|lcbo|beer\s*store/i, category: "shopping" },
  { pattern: /netflix|spotify|disney|crave|apple\s*tv|prime\s*video|youtube\s*premium|deezer| cinema|cinema\s*guzzo|cineplex|landmark\s*cinemas|theatre|steam|playstation|xbox|nintendo|epic\s*games/i, category: "entertainment" },
  { pattern: /air\s*canada|airtransat|westjet|porter\s*air|airbnb|booking\.com|expedia|hotels\.com|marriott|hilton|via\s*rail|ortrains|delta\s*hotels|travel/i, category: "travel" },
  { pattern: /mbna|tangerine\s*credit|credit\s*card\s*payment|payment\s*card|card\s*payment|loan\s*payment|line\s*of\s*credit|student\s*loan|osap\s*loan|osap/i, category: "debt" },
  { pattern: /wealthsimple|questrade|tangerine\s*investment|rrsp|tfsa\s*contrib|resp\s*contrib|vanguard|ishares|mutual\s*fund|GIC\s*purchase|questwealth/i, category: "savings" },
  { pattern: /interest\s*(?:charge|fee)|monthly\s*fee|service\s*charge|overdraft|nsf|atm\s*fee|foreign\s*transaction\s*fee|account\s*fee|paper\s*statement\s*fee/i, category: "fees" },
  { pattern: / cra\b|canada\s*revenue|revenue\s*canada|income\s*tax|gst\/?hst|property\s*tax|municipal\s*tax/i, category: "taxes" },
];

const PAYROLL_PATTERN =
  /payroll|pay\s*dep|direct\s*deposit.*?(?:pay|salary|wage)|salary|wages|pension|gouvernement|government|employment\s*insurance|canada\s*(?:child|workers|revenue|pension)|ei\s*deposit|cra\s*deposit/i;

export function categorizeByRules(
  description: string,
  amount: number,
  isTransferTx = false
): string {
  if (isTransferTx) return "transfers";
  if (amount > 0) {
    if (PAYROLL_PATTERN.test(description)) return "income";
    return "income"; // all inflows default to income; users can reclassify
  }
  for (const rule of RULES) {
    if (rule.pattern.test(description)) return rule.category;
  }
  return "other";
}

export interface RuleContext {
  userId: string;
}

/** User merchant rules (userId or global) win over built-in rules. */
export async function applyUserRules(
  description: string,
  userId: string
): Promise<{ categoryId: string | null; merchantName: string | null }> {
  const rules = await prisma.merchantRule.findMany({
    where: { enabled: true, OR: [{ userId }, { userId: null }] },
    orderBy: { priority: "asc" },
  });
  for (const rule of rules) {
    if (matches(rule, description)) {
      return { categoryId: rule.categoryId, merchantName: rule.merchantName };
    }
  }
  return { categoryId: null, merchantName: null };
}

function matches(rule: MerchantRule, description: string): boolean {
  const hay = description.toLowerCase();
  const needle = rule.pattern.toLowerCase();
  switch (rule.matchType) {
    case "EXACT":
      return hay === needle;
    case "PREFIX":
      return hay.startsWith(needle);
    case "REGEX":
      try {
        return new RegExp(rule.pattern, "i").test(description);
        } catch {
        return false;
      }
    default:
      return hay.includes(needle);
  }
}

/**
 * Full categorization for one transaction description.
 * Order: user merchant rules > built-in keyword rules > fallback.
 */
export async function categorize(
  description: string,
  amount: number,
  userId: string,
  isTransferTx: boolean
): Promise<{ categoryKey: string; source: "USER" | "RULE" }> {
  const user = await applyUserRules(description, userId);
  if (user.categoryId) {
    const cat = await prisma.transactionCategory.findFirst({
      where: { id: user.categoryId },
      select: { key: true },
    });
    if (cat) return { categoryKey: cat.key, source: "USER" };
  }
  return {
    categoryKey: categorizeByRules(description, amount, isTransferTx),
    source: "RULE",
  };
}

/** Resolve category keys to DB ids, creating any that are missing. */
export async function ensureCategories(userId: string): Promise<Map<string, string>> {
  const keys = new Set(SYSTEM_CATEGORIES.map((c) => c.key));
  const existing = await prisma.transactionCategory.findMany({
    where: { key: { in: [...keys] } },
  });
  const byKey = new Map(existing.map((c) => [c.key, c.id]));

  for (const def of SYSTEM_CATEGORIES) {
    if (!byKey.has(def.key)) {
      const created = await prisma.transactionCategory.create({
        data: {
          key: def.key,
          label: def.label,
          group: def.group,
          color: def.color,
          sortOrder: def.sortOrder,
          isSystem: true,
        },
      });
      byKey.set(def.key, created.id);
    }
  }

  // Attach custom user categories for rule-writing flows.
  void userId;
  return byKey;
}
