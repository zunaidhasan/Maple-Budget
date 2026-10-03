// Postgres-backed job queue (section 7). Dependency-free: jobs are claimed
// via a conditional update so only one worker wins; failures retry with
// exponential backoff and are dead-lettered after maxAttempts.

import { prisma } from "./db";
import { env } from "./config";
import type { Job } from "@prisma/client";

export type JobType =
  | "process_webhook"
  | "sync_connection"
  | "normalize_transactions"
  | "apply_categorization"
  | "detect_recurring"
  | "recalc_aggregates"
  | "deliver_notification"
  | "detect_goal_status";

export const DEFAULT_MAX_ATTEMPTS = env.jobMaxAttempts;

export async function enqueue(
  type: JobType,
  payload: Record<string, unknown>,
  opts?: { runAfter?: Date; priority?: number; maxAttempts?: number }
): Promise<Job> {
  return prisma.job.create({
    data: {
      type,
      payload: payload as object,
      runAfter: opts?.runAfter ?? new Date(),
      priority: opts?.priority ?? 100,
      maxAttempts: opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    },
  });
}

/** Claim the next runnable job (highest priority, longest waiting first). */
export async function claimJob(): Promise<Job | null> {
  const candidates = await prisma.job.findMany({
    where: { status: "PENDING", runAfter: { lte: new Date() } },
    orderBy: [{ priority: "asc" }, { runAfter: "asc" }, { createdAt: "asc" }],
    take: 5,
  });
  for (const job of candidates) {
    const updated = await prisma.job.updateMany({
      where: { id: job.id, status: "PENDING" }, // conditional: one winner
      data: {
        status: "RUNNING",
        reservedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
    if (updated.count === 1) {
      return { ...job, status: "RUNNING", attempts: job.attempts + 1 };
    }
    // lost the race; try the next candidate
  }
  return null;
}

/** Mark done, schedule a retry with backoff, or dead-letter. */
export async function completeJob(job: Job, error?: unknown): Promise<void> {
  if (!error) {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "DONE", lastError: null, reservedAt: null },
    });
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  const exhausted = job.attempts >= job.maxAttempts;
  const backoffSec = Math.min(300, 2 ** job.attempts); // 2,4,8… capped at 5min
  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: exhausted ? "DEAD" : "PENDING",
      runAfter: new Date(Date.now() + backoffSec * 1000),
      lastError: message.slice(0, 500),
      reservedAt: null,
    },
  });
  if (exhausted) {
    console.error(`[jobs] DEAD job ${job.type} ${job.id}: ${message}`);
  }
}

/** Recover jobs left RUNNING by a crashed worker. */
export const STALE_RUNNING_MS = 10 * 60 * 1000;

export async function recoverStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  const result = await prisma.job.updateMany({
    where: { status: "RUNNING", reservedAt: { lt: cutoff } },
    data: { status: "PENDING", reservedAt: null, runAfter: new Date() },
  });
  return result.count;
}
