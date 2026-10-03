// Recurring transaction & income detection (section 4.8).
//
// Approach: group candidate transactions by normalized merchant, then look
// for consistent amounts and regular intervals. Confidence blends amount
// stability, interval regularity, and history length. Patterns are stored
// as RecurringPattern rows with status SUGGESTED for user review.

import { prisma } from "./db";
import { extractMerchant } from "./flinks/normalize";
import type { Transaction } from "@prisma/client";

interface IntervalStats {
  medianIntervalDays: number;
  intervalStability: number; // 0..1
  frequency: "WEEKLY" | "BIWEEKLY" | "SEMIMONTHLY" | "MONTHLY" | "QUARTERLY" | "VARIABLE";
  occurrenceCount: number;
  amountMin: number;
  amountMax: number;
  avgAmount: number;
  amountStability: number; // 0..1
  lastSeenAt: Date;
  firstSeenAt: Date;
  nextExpectedAt: Date | null;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function coefficientOfVariation(nums: number[]): number {
  if (nums.length < 2) return 1;
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
  if (mean === 0) return 1;
  const variance =
    nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

function classifyFrequency(medianDays: number): IntervalStats["frequency"] {
  if (medianDays <= 8) return "WEEKLY"; // 7±1
  if (medianDays <= 17) return "BIWEEKLY"; // 14±3
  if (medianDays <= 45) return "MONTHLY"; // 30±15 catches semimonthly too
  if (medianDays <= 110) return "QUARTERLY";
  return "VARIABLE";
}

function computeStats(
  merchant: string,
  txs: Transaction[]
): IntervalStats | null {
  if (txs.length < 2) return null;
  const sorted = [...txs].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const amounts = sorted.map((t) => Math.abs(Number(t.amount)));
  const avgAmount = amounts.reduce((s, n) => s + n, 0) / amounts.length;

  // Cluster tolerance: amounts must be within 25% of the mean (min $1).
  const tolerance = Math.max(avgAmount * 0.25, 1);
  const clustered = amounts.filter((a) => Math.abs(a - avgAmount) <= tolerance);
  if (clustered.length < Math.max(2, Math.ceil(txs.length * 0.5))) return null;

  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d =
      (sorted[i].date.getTime() - sorted[i - 1].date.getTime()) / 86_400_000;
    intervals.push(d);
  }
  const med = median(intervals);
  if (med < 3 || med > 120) return null; // too erratic to be a salary cadence

  const cvAmounts = coefficientOfVariation(clustered);
  if (cvAmounts > 0.3) return null; // amounts too different

  const cvIntervals = coefficientOfVariation(intervals);
  const intervalStability = Math.max(0, 1 - cvIntervals);
  const amountStability = Math.max(0, 1 - cvAmounts);
  const historyFactor = Math.min(1, (clustered.length - 1) / 4);

  const confidence = Math.min(
    0.99,
    0.45 * intervalStability +
      0.35 * amountStability +
      0.2 * historyFactor
  );
  if (confidence < 0.6) return null;

  const last = sorted[sorted.length - 1];
  const nextExpectedAt = new Date(last.date);
  nextExpectedAt.setUTCDate(nextExpectedAt.getUTCDate() + Math.round(med));

  return {
    medianIntervalDays: Math.round(med),
    intervalStability,
    frequency: classifyFrequency(med),
    occurrenceCount: clustered.length,
    amountMin: Math.min(...clustered),
    amountMax: Math.max(...clustered),
    avgAmount: Math.round(avgAmount * 100) / 100,
    amountStability,
    firstSeenAt: sorted[0].date,
    lastSeenAt: last.date,
    nextExpectedAt,
  };
}

function groupKey(t: Transaction): string {
  const merchant = extractMerchant(t.merchantName ?? t.description);
  // Round amount to $5 buckets so ±$2 payroll variation still groups.
  const bucket = Math.round(Math.abs(Number(t.amount)) / 5);
  return `${merchant.toLowerCase()}|${t.type}|${bucket}`;
}

/**
 * Scan a user's transactions and upsert suggested recurring patterns.
 * Existing CONFIRMED/REJECTED patterns are never overwritten.
 */
export async function detectRecurringPatterns(userId: string): Promise<{
  created: number;
  updated: number;
}> {
  const txs = await prisma.transaction.findMany({
    where: {
      userId,
      isExcluded: false,
      isTransfer: false,
      status: "POSTED",
    },
    orderBy: { date: "asc" },
  });

  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    const key = groupKey(t);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }

  let created = 0;
  let updated = 0;

  for (const [, txGroup] of groups) {
    const stats = computeStats(
      extractMerchant(txGroup[0].merchantName ?? txGroup[0].description),
      txGroup
    );
    if (!stats) continue;

    const merchant = extractMerchant(txGroup[0].merchantName ?? txGroup[0].description);
    const kind = txGroup[0].type === "CREDIT" ? "INCOME" : "EXPENSE";
    const accountIds = [...new Set(txGroup.map((t) => t.accountId))];

    const existing = await prisma.recurringPattern.findFirst({
      where: { userId, merchantName: merchant, kind },
    });

    if (existing) {
      if (existing.status === "SUGGESTED") {
        await prisma.recurringPattern.update({
          where: { id: existing.id },
          data: {
            frequency: stats.frequency,
            intervalDays: stats.medianIntervalDays,
            avgAmount: stats.avgAmount,
            amountMin: stats.amountMin,
            amountMax: stats.amountMax,
            accountIds,
            occurrenceCount: stats.occurrenceCount,
            confidence: stats.intervalStability * 0.5 + stats.amountStability * 0.5,
            firstSeenAt: stats.firstSeenAt,
            lastSeenAt: stats.lastSeenAt,
            nextExpectedAt: stats.nextExpectedAt,
          },
        });
        updated++;
      }
      continue;
    }

    await prisma.recurringPattern.create({
      data: {
        userId,
        kind,
        status: "SUGGESTED",
        merchantName: merchant,
        frequency: stats.frequency,
        intervalDays: stats.medianIntervalDays,
        avgAmount: stats.avgAmount,
        amountMin: stats.amountMin,
        amountMax: stats.amountMax,
        accountIds,
        occurrenceCount: stats.occurrenceCount,
        confidence: Math.round(
          (stats.intervalStability * 0.5 + stats.amountStability * 0.5) * 100
        ) / 100,
        firstSeenAt: stats.firstSeenAt,
        lastSeenAt: stats.lastSeenAt,
        nextExpectedAt: stats.nextExpectedAt,
      },
    });
    created++;
  }

  return { created, updated };
}
