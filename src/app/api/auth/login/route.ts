// POST /api/auth/login — sign in (section 8).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession, setSessionCookie, audit } from "@/lib/auth";
import { fail, ok, parseBody, rateLimit } from "@/lib/api";

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const rl = rateLimit(req, "login", 10, 900); // 10 per 15 min per IP
  if (!rl.allowed) return fail(429, "Too many attempts. Try later.");

  let emailForAudit = "";
  try {
    const body = await parseBody(req, schema);
    emailForAudit = body.email.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email: emailForAudit } });
    if (!user || user.deletedAt) {
      await audit({ action: "auth.login.failed", metadata: { reason: "no-user" } });
      return fail(401, "Invalid email or password");
    }
    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      await audit({ userId: user.id, action: "auth.login.failed", metadata: { reason: "bad-password" } });
      return fail(401, "Invalid email or password");
    }

    const { raw } = await createSession(user.id, {
      userAgent: req.headers.get("user-agent") ?? undefined,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0],
    });
    await setSessionCookie(raw);
    await audit({ userId: user.id, action: "auth.login", ip: req.headers.get("x-forwarded-for") ?? undefined });

    return ok({ user: { id: user.id, email: user.email, displayName: user.displayName } });
  } catch (err) {
    if (err instanceof z.ZodError) return fail(400, "Validation failed");
    console.error("[login]", err);
    return fail(500, "Internal server error");
  }
}
