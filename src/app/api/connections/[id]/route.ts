// DELETE /api/connections/:id — disconnect or archive (section 4.2).
// Accounts are retained as historical records: they are marked closed and
// their transactions remain (section 4.3).

import { prisma } from "@/lib/db";
import { fail, ok, withUser } from "@/lib/api";
import { audit } from "@/lib/auth";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withUser(async (user) => {
    const connection = await prisma.providerConnection.findFirst({
      where: { id, userId: user.id },
    });
    if (!connection) return fail(404, "Connection not found");

    await prisma.$transaction(async (tx) => {
      await tx.providerConnection.update({
        where: { id: connection.id },
        data: {
          status: "DISCONNECTED",
          disconnectedAt: new Date(),
          accessTokenEnc: null, // purge provider handle
          refreshTokenEnc: null,
        },
      });
      await tx.financialAccount.updateMany({
        where: { connectionId: connection.id },
        data: { isClosed: true, closedAt: new Date() },
      });
    });

    await audit({
      userId: user.id,
      action: "connection.delete",
      entity: "provider_connection",
      entityId: connection.id,
    });
    return ok({ success: true });
  });
}
