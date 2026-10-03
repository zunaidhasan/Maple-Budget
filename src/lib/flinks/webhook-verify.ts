// Webhook verification (section 4.4). Supports HMAC-SHA256 via
// FLINKS_WEBHOOK_SECRET. Signature may arrive as a raw hex digest or as
// "sha256=<hex>". Replay protection: timestamps older than 10 minutes are
// rejected when a timestamp header is present.

import { hmacSha256Hex, safeEqual } from "../crypto";

const MAX_SKEW_MS = 10 * 60 * 1000;

export interface WebhookVerifyResult {
  ok: boolean;
  reason?: string;
}

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  secret: string
): WebhookVerifyResult {
  if (!secret) {
    return { ok: false, reason: "Webhook secret not configured" };
  }
  if (!signatureHeader) {
    return { ok: false, reason: "Missing signature header" };
  }

  const expected = hmacSha256Hex(secret, rawBody);
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;
  if (!safeEqual(expected, provided.toLowerCase())) {
    return { ok: false, reason: "Signature mismatch" };
  }

  if (timestampHeader) {
    const ts = Number(timestampHeader);
    if (!Number.isFinite(ts)) {
      return { ok: false, reason: "Invalid timestamp" };
    }
    const tsMs = ts > 1e12 ? ts : ts * 1000; // ms or seconds
    if (Math.abs(Date.now() - tsMs) > MAX_SKEW_MS) {
      return { ok: false, reason: "Replay rejected: timestamp outside window" };
    }
  }
  return { ok: true };
}
