// Sync health (section 4.3/4.5) — per-connection status and recent runs.

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardTitle, Badge, dateShort } from "@/components/ui";
import { ConnectBankButton } from "@/components/connect-bank-button";
import { RefreshButton } from "@/components/refresh-button";

export const dynamic = "force-dynamic";

export default async function SyncPage() {
  const user = await requireUser();

  const connections = await prisma.providerConnection.findMany({
    where: { userId: user.id },
    include: {
      institution: true,
      syncRuns: { orderBy: { startedAt: "desc" }, take: 3 },
    },
    orderBy: { createdAt: "desc" },
  });

  const events = await prisma.webhookEvent.findMany({
    where: { connection: { userId: user.id } },
    orderBy: { receivedAt: "desc" },
    take: 10,
  });

  return (
    <div className="space-y-4">
      <ConnectBankButton />

      {connections.length === 0 ? (
        <Card>
          <p className="text-sm text-(--muted)">
            No connections yet. Data synchronization activity will appear here
            after you link your first institution.
          </p>
        </Card>
      ) : (
        connections.map((c) => {
          const tone =
            c.status === "ACTIVE"
              ? "success"
              : c.status === "REAUTH_REQUIRED" || c.status === "ERROR"
                ? "danger"
                : "warning";
          return (
            <Card key={c.id}>
              <CardTitle
                action={<Badge tone={tone}>{c.status.toLowerCase().replaceAll("_", " ")}</Badge>}
              >
                {c.institution.name}
              </CardTitle>
              <p className="text-sm text-(--muted)">
                Last successful sync:{" "}
                {c.lastSuccessfulSyncAt ? dateShort(c.lastSuccessfulSyncAt) : "never"}
              </p>
              {c.lastError && (
                <p className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-200">
                  {c.lastError}
                </p>
              )}
              {c.status === "REAUTH_REQUIRED" && (
                <p className="mt-2 text-xs">
                  Reconnect this institution from the Accounts screen to restore
                  synchronization.
                </p>
              )}
              <div className="mt-3">
                <RefreshButton connectionId={c.id} />
              </div>

              {c.syncRuns.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-(--muted)">
                  {c.syncRuns.map((r) => (
                    <li key={r.id} className="flex justify-between">
                      <span>
                        {r.trigger.toLowerCase()} · {dateShort(r.startedAt)}
                      </span>
                      <span>
                        {r.status === "SUCCESS"
                          ? `+${r.created} new · ${r.updated} updated · ${r.duplicatesSkipped} dupes`
                          : r.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })
      )}

      {events.length > 0 && (
        <Card>
          <CardTitle>Recent provider events</CardTitle>
          <ul className="space-y-1 text-xs text-(--muted)">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between">
                <span>{e.eventType}</span>
                <span>
                  {e.status.toLowerCase()} · {dateShort(e.receivedAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
