// In-memory fixed-window rate limiter for sensitive routes (section 9).
// Correct for a single server instance. For multi-instance/serverless
// deployments, back this interface with Redis instead — the call sites
// only depend on checkRateLimit().

interface WindowState {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowState>();

// Periodically evict expired windows so the map does not grow unbounded.
let lastSweep = 0;

function sweep() {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, state] of windows) {
    if (state.resetAt < now) windows.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number
): RateLimitResult {
  sweep();
  const now = Date.now();
  const windowStart = Math.floor(now / (windowSec * 1000)) * windowSec * 1000;
  const resetAt = windowStart + windowSec * 1000;
  const mapKey = `${key}:${windowStart}`;

  const state = windows.get(mapKey) ?? { count: 0, resetAt };
  state.count += 1;
  windows.set(mapKey, state);

  return {
    allowed: state.count <= limit,
    remaining: Math.max(0, limit - state.count),
    resetAt,
  };
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}
