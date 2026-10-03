// POST /api/auth/logout — destroy session (section 9: logout behavior).

import { destroySession, getSessionUser, audit } from "@/lib/auth";
import { ok } from "@/lib/api";

export async function POST() {
  const session = await getSessionUser();
  await destroySession();
  if (session) await audit({ userId: session.user.id, action: "auth.logout" });
  return ok({ success: true });
}
