// Payload redaction for webhook logging (section 4.4: sensitive fields
// redacted before persistence).

const SENSITIVE_KEYS = [
  "accessToken",
  "refreshToken",
  "password",
  "secret",
  "token",
  "username",
  "credential",
  "authorization",
  "institutionPassword",
  "answer",
  "pin",
];

export function redactPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => redactPayload(v, depth + 1));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s.toLowerCase()))) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactPayload(v, depth + 1);
      }
    }
    return out;
  }
  if (typeof value === "string" && value.length > 500) {
    return value.slice(0, 500) + "…";
  }
  return value;
}
