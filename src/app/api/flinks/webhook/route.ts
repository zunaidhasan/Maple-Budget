// POST /api/flinks/webhook — receive Flinks callbacks (section 4.4).
//
// Pipeline: verify HMAC signature -> idempotency check on eventId ->
// store redacted payload -> enqueue processing job -> 202 immediately.
// Longer work never runs inside the request (section 7).

import { prisma } from "@/lib/db";
import { fail, ok, rateLimit } from "@/lib/api";
import { verifyWebhookSignature } from "@/lib/flinks/webhook-verify";
import { redactPayload } from "@/lib/flinks/redact";
import { enqueue } from "@/lib/jobs";
import { env } from "@/lib/config";

export async function POST(req: Request) {
  // Webhooks are unauthenticated by nature; rate-limit + verify instead.
  const rl = rateLimit(req, "webhook", 120, 60);
  if (!rl.allowed) return fail(429, "Too many requests");

  const raw = await req.text();
  const verification = verifyWebhookSignature(
    raw,
    req.headers.get("x-flinks-signature") ??
      req.headers.get("x-signature") ??
      req.headers.get("flinks-signature"),
    req.headers.get("x-flinks-timestamp") ?? req.headers.get("x-timestamp"),
    env.flinks.webhookSecret
  );
  if (!verification.ok) {
    console.warn("[webhook] rejected:", verification.reason);
    return fail(401, "Invalid webhook signature");
  }

  let body: {
    eventId?: string;
    eventType?: string;
    type?: string;
    requestId?: string;
    linkId?: string;
    connectionId?: string;
    payload?: unknown;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Invalid JSON");
  }

  const eventId = body.eventId ?? crypto.randomUUID();
  const eventType = body.eventType ?? body.type ?? "UNKNOWN";
  const inner = redactPayload(body.payload ?? body);

  // Connection mapping: Flinks sends linkId/requestId; we map to our internal
  // connection. Simulated events may carry connectionId directly.
  let connectionId: string | null = body.connectionId ?? null;
  if (!connectionId && (body.linkId || body.requestId)) {
    const conn = await prisma.providerConnection.findFirst({
      where: {
        OR: [
          ...(body.linkId ? [{ flinksLinkId: body.linkId }] : []),
          ...(body.requestId ? [{ flinksRequestId: body.requestId }] : []),
        ],
      },
      select: { id: true },
    });
    connectionId = conn?.id ?? null;
  }

  // Idempotent receive: unique eventId (section 4.4).
  const event = await prisma.webhookEvent
    .create({
      data: {
        provider: "flinks",
        eventId,
        eventType,
        connectionId,
        payload: inner as object,
        status: "RECEIVED",
      },
    })
    .catch(() => null); // duplicate eventId -> null

  if (!event) {
    return ok({ status: "duplicate-ignored" }); // already processed before
  }

  await enqueue(
    "process_webhook",
    { eventId: event.id, eventType, connectionId },
    { priority: 10 }
  );

  return ok({ status: "accepted" }, { status: 202 });
}
