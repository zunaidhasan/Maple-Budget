// GET /api/dashboard — dashboard summary (section 4.11, section 8).

import { withUser } from "@/lib/api";
import { computeDashboard } from "@/lib/aggregates";

export async function GET() {
  return withUser(async (user) => {
    const summary = await computeDashboard(user.id);
    return summary as unknown as Record<string, unknown>;
  });
}
