// Shared helpers for API route handlers.

import { NextResponse } from "next/server";
import { ZodError, ZodType } from "zod";
import { AuthError, requireUser } from "./auth";
import { checkRateLimit, clientIp } from "./rate-limit";
import type { User } from "@prisma/client";

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as object, init);
}

export function fail(status: number, error: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error, ...extra }, { status });
}

/** Wrap a handler with the authenticated-user guard. */
export async function withUser<T>(
  handler: (user: User) => Promise<T>
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const data = await handler(user);
    if (data instanceof NextResponse) return data;
    return ok(data);
  } catch (err) {
    if (err instanceof AuthError) return fail(401, "Unauthorized");
    if (err instanceof ZodError) {
      return fail(400, "Validation failed", {
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    console.error("[api] error:", err);
    return fail(500, "Internal server error");
  }
}

/** Parse and validate a JSON body with zod. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new Error("Invalid JSON body");
  }
  return schema.parse(raw);
}

/** Rate-limit by client IP for a named bucket. Throws nothing; returns ok? */
export function rateLimit(
  req: Request,
  bucket: string,
  limit: number,
  windowSec: number
): { allowed: boolean; resetAt: number } {
  const ip = clientIp(new Headers(req.headers));
  const result = checkRateLimit(`${bucket}:${ip}`, limit, windowSec);
  return { allowed: result.allowed, resetAt: result.resetAt };
}

export function formatCents(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
}
