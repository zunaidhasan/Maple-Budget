// Connection sync service (sections 4.3, 4.5, 4.6). Fetches account and
// transaction data from Flinks, normalizes it, and upserts internal records
// with duplicate protection and sync-run bookkeeping.

import { prisma } from "./db";
import { flinks } from "./flinks/client";
import {
  normalizeAccount,
  normalizeTransaction,
} from "./flinks/normalize";
import { decrypt } from "./crypto";
import { extractMerchant } from "./flinks/normalize";
import { categorize, ensureCategories } from "./categories";
import { enqueue } from "./jobs";

const DAYS_BACK = 95; // Flinks standard history window

function mapKind(kind: string) {
  const allowed = [
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
  return (allowed as readonly string[]).includes(kind) ? kind : "OTHER";
}

/**
 * Full sync for one connection: accounts first, then transactions per
 * account. Creates a TransactionSyncRun and updates connection health.
 */
export async function syncConnection(
  connectionId: string,
  trigger: "WEBHOOK" | "MANUAL" | "SCHEDULED"
): Promise<{ ok: boolean; error?: string; created: number; updated: number }> {
  const connection = await prisma.providerConnection.findUnique({
    where: { id: connectionId },
    include: { institution: true },
  });
  if (!connection) {
    return { ok: false, error: "Connection not found", created: 0, updated: 0 };
  }

  const run = await prisma.transactionSyncRun.create({
    data: { connectionId, trigger, status: "RUNNING" },
  });

  try {
    if (!connection.accessTokenEnc) {
      throw new Error("Connection has no stored access token");
    }
    const accessToken = decrypt(connection.accessTokenEnc);

    // 1) Accounts ----------------------------------------------------------
    const auth = await flinks.authorize(
      connection.flinksRequestId ?? connection.id,
      connection.institution.providerSlug
    );
    const accountIds = auth.accounts.map((a) => a.providerAccountId);
    const detail = await flinks.getAccountsDetail(
      accessToken,
      accountIds,
      DAYS_BACK
    );

    await ensureCategories(connection.userId);
    let created = 0;
    let updated = 0;
    let duplicatesSkipped = 0;

    for (const rawAccount of auth.accounts) {
      const normalized = normalizeAccount(rawAccount);
      const account = await prisma.financialAccount.upsert({
        where: {
          connectionId_providerAccountId: {
            connectionId,
            providerAccountId: normalized.providerAccountId,
          },
        },
        create: {
          userId: connection.userId,
          connectionId,
          institutionId: connection.institutionId,
          providerAccountId: normalized.providerAccountId,
          source: "FLINKS",
          name: normalized.name,
          kind: mapKind(normalized.kind) as never,
          subtype: normalized.subtype,
          currency: normalized.currency,
          currentBalance: normalized.currentBalance,
          availableBalance: normalized.availableBalance,
          creditLimit: normalized.creditLimit,
          mask: normalized.mask,
          lastSyncedAt: new Date(),
        },
        update: {
          name: normalized.name,
          currentBalance: normalized.currentBalance,
          availableBalance: normalized.availableBalance,
          creditLimit: normalized.creditLimit,
          lastSyncedAt: new Date(),
        },
      });

      // Balance snapshot per sync (section 6: account_balance_snapshots)
      await prisma.accountBalanceSnapshot.create({
        data: {
          accountId: account.id,
          balance: account.currentBalance,
          availableBalance: account.availableBalance,
          source: "SYNC",
        },
      });

      // 2) Transactions ------------------------------------------------------
      const txs = detail[rawAccount.providerAccountId] ?? [];
      for (const rawTx of txs) {
        const normalizedTx = normalizeTransaction(
          account.id,
          account.currency,
          rawTx
        );

        // Duplicate protection (section 4.5): unique
        // (accountId, providerTransactionId) + fingerprint fallback.
        const existing = await prisma.transaction.findFirst({
          where: {
            accountId: account.id,
            OR: [
              { providerTransactionId: normalizedTx.providerTransactionId },
              { fingerprint: normalizedTx.fingerprint },
            ],
          },
        });

        if (existing) {
          const changed =
            !existing.amount.equals(normalizedTx.amount) ||
            existing.status !== normalizedTx.status ||
            existing.description !== normalizedTx.description;
          if (changed) {
            await prisma.transaction.update({
              where: { id: existing.id },
              data: {
                amount: normalizedTx.amount,
                status: normalizedTx.status,
                description: normalizedTx.description,
                postedDate: normalizedTx.postedDate,
              },
            });
            updated++;
          } else {
            duplicatesSkipped++;
          }
        } else {
          const catResult = await categorize(
            normalizedTx.rawDescription,
            normalizedTx.amount,
            connection.userId,
            normalizedTx.isTransfer
          );
          await prisma.transaction.create({
            data: {
              userId: connection.userId,
              accountId: account.id,
              providerTransactionId: normalizedTx.providerTransactionId,
              fingerprint: normalizedTx.fingerprint,
              type: normalizedTx.type,
              status: normalizedTx.status,
              amount: normalizedTx.amount,
              currency: normalizedTx.currency,
              date: normalizedTx.date,
              postedDate: normalizedTx.postedDate,
              description: normalizedTx.description,
              merchantName: extractMerchant(normalizedTx.rawDescription),
              rawDescription: normalizedTx.rawDescription,
              isTransfer: normalizedTx.isTransfer,
              categorization: catResult.source,
            },
          });
          created++;
        }
      }
    }

    await prisma.transactionSyncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        fetched: txsTotal(detail),
        created,
        updated,
        duplicatesSkipped,
        finishedAt: new Date(),
      },
    });
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: {
        status: "ACTIVE",
        lastSuccessfulSyncAt: new Date(),
        lastSyncStatus: "SUCCESS",
        lastError: null,
      },
    });

    // 3) Post-sync pipeline (section 7) ------------------------------------
    await enqueue("apply_categorization", { userId: connection.userId }, { priority: 60 });
    await enqueue("detect_recurring", { userId: connection.userId }, { priority: 70 });
    await enqueue("recalc_aggregates", { userId: connection.userId }, { priority: 80 });

    return { ok: true, created, updated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.transactionSyncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message.slice(0, 500), finishedAt: new Date() },
    });
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: {
        status: /reauth|unauthorized|401|403|credential/i.test(message)
          ? "REAUTH_REQUIRED"
          : "ERROR",
        lastSyncStatus: "FAILED",
        lastError: sanitizeUserError(message),
      },
    });
    return { ok: false, error: message, created: 0, updated: 0 };
  }
}

/** Re-run rule categorization over RULE-sourced transactions. */
export async function applyCategorization(userId: string): Promise<number> {
  const { categorize } = await import("./categories");
  const batch = await prisma.transaction.findMany({
    where: { userId, categorization: "RULE" },
    take: 500,
  });
  const catMap = await ensureCategories(userId);
  let count = 0;
  for (const tx of batch) {
    const result = await categorize(
      tx.merchantName ?? tx.description,
      Number(tx.amount),
      userId,
      tx.isTransfer
    );
    const categoryId = catMap.get(result.categoryKey) ?? null;
    if (categoryId && categoryId !== tx.categoryId) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { categoryId, categorization: result.source },
      });
      count++;
    }
  }
  return count;
}

/** Webhook processing entrypoint (section 4.4). */
export async function processWebhookEvent(
  eventId: string,
  eventType: string,
  connectionId: string | null
): Promise<void> {
  if (!connectionId) {
    throw new Error("Webhook event has no connection mapping");
  }
  const connection = await prisma.providerConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection || connection.status === "DISCONNECTED") {
    throw new Error("Connection missing or disconnected");
  }
  if (eventType === "ACCOUNT_UNLINKED" || eventType === "CONSENT_REVOKED") {
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: "REAUTH_REQUIRED", lastError: "Bank access revoked or expired" },
    });
    return;
  }
  // All data-bearing events trigger a sync; idempotency is provided by the
  // webhook_events unique eventId + transaction duplicate protection.
  await syncConnection(connectionId, "WEBHOOK");
}

function txsTotal(detail: Record<string, unknown[]>): number {
  return Object.values(detail).reduce((s, arr) => s + arr.length, 0);
}

/** Error text safe to show in the UI: redacts tokens, truncates. */
function sanitizeUserError(message: string): string {
  return message
    .replace(/Bearer\s+[\w.-]+/gi, "Bearer ***")
    .replace(/(access_?token|refresh_?token)["']?\s*[:=]\s*["']?[\w.-]+/gi, "$1: ***")
    .slice(0, 200);
}
