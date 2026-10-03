// Protected app layout: all /app routes require a session (section 4.1).

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const unread = await prisma.notification.count({
    where: { userId: session.user.id, readAt: null },
  });

  return (
    <AppShell title="Maple Budget" unread={unread}>
      {children}
    </AppShell>
  );
}
