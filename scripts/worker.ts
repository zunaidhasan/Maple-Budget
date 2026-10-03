// Background worker (section 7). Run with: npm run worker
// Claims queued jobs and executes handlers; long-running or retryable work
// never blocks the request-response cycle.

import { prisma } from "../src/lib/db";
import { claimJob, completeJob, recoverStaleJobs, type JobType } from "../src/lib/jobs";
import { syncConnection, applyCategorization, processWebhookEvent } from "../src/lib/sync";
import { detectRecurringPatterns } from "../src/lib/recurring";
import { computeDashboard } from "../src/lib/aggregates";
import {
  evaluateBudgetNotifications,
  evaluateGoalNotifications,
  evaluateIncomeNotifications,
} from "../src/lib/notifications";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);

type Handler = (payload: Record<string, unknown>) => Promise<unknown>;

const handlers: Record<JobType, Handler> = {
  process_webhook: async (p) =>
    processWebhookEvent(
      String(p.eventId),
      String(p.eventType),
      (p.connectionId as string) ?? null
    ),
  sync_connection: async (p) =>
    syncConnection(String(p.connectionId), (p.trigger as "MANUAL") ?? "SCHEDULED"),
  normalize_transactions: async () => {
    // Normalization happens inline during syncConnection; retained as a
    // no-op queue step for pipeline compatibility.
  },
  apply_categorization: async (p) => applyCategorization(String(p.userId)),
  detect_recurring: async (p) => detectRecurringPatterns(String(p.userId)),
  recalc_aggregates: async (p) => {
    await computeDashboard(String(p.userId));
    await evaluateBudgetNotifications(String(p.userId));
    await evaluateIncomeNotifications(String(p.userId));
    await evaluateGoalNotifications(String(p.userId));
  },
  deliver_notification: async (p) => {
    const { notify } = await import("../src/lib/notifications");
    await notify({
      userId: String(p.userId),
      type: (p.type as "SYSTEM") ?? "SYSTEM",
      title: String(p.title),
      body: String(p.body),
      data: p.data as Record<string, unknown> | undefined,
    });
  },
  detect_goal_status: async (p) => evaluateGoalNotifications(String(p.userId)),
};

let running = true;

process.on("SIGINT", () => {
  running = false;
  console.log("[worker] shutting down after current job…");
});
process.on("SIGTERM", () => {
  running = false;
});

async function tick(): Promise<void> {
  const recovered = await recoverStaleJobs();
  if (recovered > 0) console.log(`[worker] recovered ${recovered} stale jobs`);

  const job = await claimJob();
  if (!job) return;

  const handler = handlers[job.type as JobType];
  if (!handler) {
    await completeJob(job, new Error(`No handler for job type ${job.type}`));
    return;
  }

  try {
    await handler(job.payload as Record<string, unknown>);
    await completeJob(job);
  } catch (err) {
    await completeJob(job, err);
  }
}

async function main(): Promise<void> {
  console.log(`[worker] started (poll ${POLL_MS}ms)`);
  while (running) {
    try {
      await tick();
    } catch (err) {
      console.error("[worker] tick error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  await prisma.$disconnect();
  console.log("[worker] stopped");
}

void main();
