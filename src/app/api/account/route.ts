// DELETE /api/account — erasure request (section 4.1, section 9).

import { prisma } from "@/lib/db";
import { ok, withUser } from "@/lib/api";
import { audit } from "@/lib/auth";

export async function DELETE() {
  return withUser(async (user) => {
    // Cascading deletes remove sessions, settings, connections, accounts,
    // transactions, budgets, goals, notifications, and audit trails.
    await prisma.user.delete({ where: { id: user.id } });
    await audit({ action: "account.deleted", metadata: { email: user.email } });
    return ok({ success: true });
  }) as Promise<Response>;
}
