// GET /api/connections — linked institutions + sync health (section 8).

import { prisma } from "@/lib/db";
import { withUser } from "@/lib/api";

export async function GET() {
  return withUser(async (user) => {
    const connections = await prisma.providerConnection.findMany({
      where: { userId: user.id },
      include: {
        institution: true,
        accounts: { where: { isClosed: false }, select: { id: true, name: true, kind: true } },
        syncRuns: { orderBy: { startedAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      connections: connections.map((c) => ({
        id: c.id,
        institution: {
          id: c.institution.id,
          name: c.institution.name,
          shortName: c.institution.shortName,
        },
        status: c.status,
        lastSuccessfulSyncAt: c.lastSuccessfulSyncAt,
        lastSyncStatus: c.lastSyncStatus,
        lastError: c.lastError,
        accounts: c.accounts,
        latestSyncRun: c.syncRuns[0]
          ? {
              id: c.syncRuns[0].id,
              status: c.syncRuns[0].status,
              startedAt: c.syncRuns[0].startedAt,
              created: c.syncRuns[0].created,
              updated: c.syncRuns[0].updated,
            }
          : null,
      })),
    };
  });
}
