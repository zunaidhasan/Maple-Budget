// POST /api/auth/register — create account (section 8).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createSession, setSessionCookie, audit } from "@/lib/auth";
import { fail, ok, parseBody, rateLimit } from "@/lib/api";

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  displayName: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  const rl = rateLimit(req, "register", 5, 900); // 5 per 15 min per IP
  if (!rl.allowed) return fail(429, "Too many attempts. Try later.");

  try {
    const body = await parseBody(req, schema);
    const email = body.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return fail(409, "An account with this email already exists");

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(body.password),
        displayName: body.displayName,
        settings: { create: {} },
      },
      select: { id: true, email: true, displayName: true },
    });

    const { raw } = await createSession(user.id, {
      userAgent: req.headers.get("user-agent") ?? undefined,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0],
    });
    await setSessionCookie(raw);
    await audit({ userId: user.id, action: "auth.register", ip: req.headers.get("x-forwarded-for") ?? undefined });

    return ok({ user }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return fail(400, "Validation failed", {
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    console.error("[register]", err);
    return fail(500, "Internal server error");
  }
}
