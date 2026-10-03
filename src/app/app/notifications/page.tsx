// Notifications (section 4.12) — in-app notification inbox.

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, EmptyState, dateShort } from "@/components/ui";
import { MarkReadButton } from "@/components/mark-read-button";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-3">
      <p className="px-1 text-sm text-(--muted)">
        {unread > 0 ? `${unread} unread` : "You're all caught up"}
      </p>

      {notifications.length === 0 ? (
        <Card>
          <EmptyState
            title="No notifications"
            hint="Budget alerts, sync problems, and income reminders will appear here."
          />
        </Card>
      ) : (
        notifications.map((n) => (
          <Card key={n.id} className={n.readAt ? "opacity-70" : "border-(--primary)"}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{n.title}</p>
                <p className="mt-0.5 text-sm text-(--muted)">{n.body}</p>
                <p className="mt-1 text-xs text-(--muted)">
                  {dateShort(n.createdAt)} · {n.type.toLowerCase().replaceAll("_", " ")}
                </p>
              </div>
              {!n.readAt && <MarkReadButton id={n.id} />}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
