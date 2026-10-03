// Session authentication using hashed opaque tokens in httpOnly cookies.
// Password hashing uses Node's built-in scrypt (no native deps).

import "server-only";
import { prisma } from "./db";
import { sha256, randomToken, safeEqual } from "./crypto";
import { env } from "./config";
import { scrypt as _scrypt } from "crypto";
import { promisify } from "util";
import type { Session, User, Prisma } from "@prisma/client";

const scryptAsync = promisify(_scrypt) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

export const SESSION_COOKIE = "cnb_session";
const SECURE = env.isProd; // cookies Secure only in prod (dev runs on http)

export async function hashPassword(password: string): Promise<string> {
  const salt = randomToken(16);
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = await scryptAsync(password, salt, 64);
  return safeEqual(derived.toString("hex"), hash);
}

export async function createSession(
  userId: string,
  meta?: { userAgent?: string; ip?: string }
): Promise<{ session: Session; raw: string }> {
  const raw = randomToken(32);
  const session = await prisma.session.create({
    data: {
      id: sha256(raw), // store only the hash
      userId,
      expiresAt: new Date(Date.now() + env.sessionTtlDays * 86_400_000),
      userAgent: meta?.userAgent?.slice(0, 250),
      ipHash: meta?.ip ? sha256(meta.ip) : undefined,
    },
  });
  return { session, raw };
}

/** Resolve the current user from the session cookie, or null. */
export async function getSessionUser(): Promise<
  (Session & { user: User }) | null
> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const session = await prisma.session.findUnique({
    where: { id: sha256(raw) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.user.deletedAt) return null;
  return session;
}

export async function setSessionCookie(raw: string): Promise<void> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  store.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE,
    path: "/",
    maxAge: env.sessionTtlDays * 86_400,
  });
}

export async function destroySession(): Promise<void> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw) {
    await prisma.session
      .deleteMany({ where: { id: sha256(raw) } })
      .catch(() => {});
  }
  store.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

export class AuthError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "AuthError";
  }
}

/** Throwing guard for API routes and server components. */
export async function requireUser(): Promise<User> {
  const session = await getSessionUser();
  if (!session) throw new AuthError();
  return session.user;
}

// ---------------------------------------------------------------------------
// Audit log (section 9)
// ---------------------------------------------------------------------------

export async function audit(input: {
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? undefined,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        ipHash: input.ip ? sha256(input.ip) : undefined,
      },
    });
  } catch {
    // Never let audit failures break the main flow.
  }
}
