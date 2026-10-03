// Settings (section 4.1) — preferences, notifications, data export/delete.

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardTitle } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";
import { LogoutButton } from "@/components/logout-button";
import { DataControls } from "@/components/data-controls";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Profile</CardTitle>
        <p className="text-sm">
          {user.displayName ?? "Unnamed"} · {user.email}
        </p>
        <div className="mt-3">
          <LogoutButton />
        </div>
      </Card>

      <SettingsForm
        initial={{
          timezone: settings?.timezone ?? "America/Toronto",
          currency: settings?.currency ?? "CAD",
          budgetWarningThreshold: settings?.budgetWarningThreshold ?? 75,
          budgetCriticalThreshold: settings?.budgetCriticalThreshold ?? 90,
        }}
      />

      <Card>
        <CardTitle>Notifications</CardTitle>
        <p className="text-sm text-(--muted)">
          In-app notifications are managed with the toggles below. Browser push
          notifications (optional, permission-gated) arrive in a later release.
        </p>
      </Card>

      <DataControls />
    </div>
  );
}
