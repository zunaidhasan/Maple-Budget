// PATCH /api/notifications/:id/read — mark as read (section 8).

import { prisma } from "@/lib/db";
import { fail, ok, withUser } from "@/lib/api";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withUser(async (user) => {
    const n = await prisma.notification.findFirst({
      where: { id, userId: user.id },
    });
    if (!n) return fail(404, "Notification not found");
    await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return ok({ success: true });
  });
}
