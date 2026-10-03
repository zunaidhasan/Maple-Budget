// Accounts (section 4.3) — aggregation view with sync health.

import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardTitle, cad, Badge, EmptyState } from "@/components/ui";
import { ConnectBankButton } from "@/components/connect-bank-button";
import { RefreshButton } from "@/components/refresh-button";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const user = await requireUser();
  const accounts = await prisma.financialAccount.findMany({
    where: { userId: user.id },
    include: { institution: true, connection: true },
    orderBy: [{ isClosed: "asc" }, { createdAt: "asc" }],
  });

  const connected = accounts.filter((a) => a.source === "FLINKS" && !a.isClosed);
  const manual = accounts.filter((a) => a.source === "MANUAL" && !a.isClosed);
  const closed = accounts.filter((a) => a.isClosed);

  return (
    <div className="space-y-4">
      <ConnectBankButton />

      {connected.length === 0 && manual.length === 0 ? (
        <Card>
          <EmptyState
            title="No accounts yet"
            hint="Connect a Canadian financial institution through Flinks, or add a manual cash account to get started."
          />
        </Card>
      ) : null}

      {connected.length > 0 && (
        <Card>
          <CardTitle>Connected accounts</CardTitle>
          <ul className="divide-y divide-(--border)">
            {connected.map((a) => {
              const status = a.connection?.status ?? "ACTIVE";
              const needsAuth = status === "REAUTH_REQUIRED" || status === "ERROR";
              return (
                <li key={a.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {a.institution?.shortName ?? a.institution?.name} · {a.name}
                      </p>
                      <p className="text-xs text-(--muted)">
                        {a.kind.replaceAll("_", " ").toLowerCase()}
                        {a.mask ? ` ••${a.mask}` : ""} · synced{" "}
                        {a.lastSyncedAt ? dateShortSync(a.lastSyncedAt) : "never"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{cad(Number(a.currentBalance))}</p>
                      {a.availableBalance != null && (
                        <p className="text-xs text-(--muted)">
                          avail {cad(Number(a.availableBalance))}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge tone={needsAuth ? "danger" : "success"}>
                      {status === "ACTIVE" ? "healthy" : status.toLowerCase().replaceAll("_", " ")}
                    </Badge>
                    {a.connectionId && (
                      <RefreshButton connectionId={a.connectionId} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {manual.length > 0 && (
        <Card>
          <CardTitle>Manual accounts</CardTitle>
          <ul className="divide-y divide-(--border)">
            {manual.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3 text-sm">
                <span>
                  {a.name}
                  <span className="block text-xs text-(--muted)">
                    {a.kind.replaceAll("_", " ").toLowerCase()}
                  </span>
                </span>
                <span className="font-semibold">{cad(Number(a.currentBalance))}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {closed.length > 0 && (
        <Card>
          <CardTitle>Disconnected / closed</CardTitle>
          <p className="text-xs text-(--muted)">
            Retained for historical reporting; transactions are kept.
          </p>
          <ul className="mt-2 divide-y divide-(--border)">
            {closed.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2 text-sm text-(--muted)">
                <span>{a.name}</span>
                <span className="text-xs">closed {a.closedAt ? dateShortSync(a.closedAt) : ""}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="px-1 text-xs text-(--muted)">
        Connection problems?{" "}
        <Link href="/app/sync" className="underline">
          View sync health
        </Link>
      </p>
    </div>
  );
}

function dateShortSync(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
