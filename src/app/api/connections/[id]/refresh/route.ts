// POST /api/connections/:id/refresh — user-initiated refresh (section 4.5).

import { prisma } from "@/lib/db";
import { fail, ok, rateLimit, withUser } from "@/lib/api";
import { enqueue } from "@/lib/jobs";
import { audit } from "@/lib/auth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rl = rateLimit(req, "refresh", 6, 300); // 6 refreshes per 5 min
  if (!rl.allowed) return fail(429, "Please wait before refreshing again");

  return withUser(async (user) => {
    const connection = await prisma.providerConnection.findFirst({
      where: { id, userId: user.id, status: { not: "DISCONNECTED" } },
    });
    if (!connection) return fail(404, "Connection not found");

    await enqueue(
      "sync_connection",
      { connectionId: connection.id, trigger: "MANUAL" },
      { priority: 30 }
    );
    await audit({
      userId: user.id,
      action: "connection.refresh",
      entity: "provider_connection",
      entityId: connection.id,
    });
    return ok({ status: "queued" });
  });
}
