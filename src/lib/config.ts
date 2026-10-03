// Central environment config. All Flinks secrets live here and are read
// server-side only (section 9: no provider credentials in client JS).

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",
  isFlinksSimulator: process.env.FLINKS_MODE === "simulator",

  // App
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL ?? "",

  // Auth
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),

  // Crypto
  encryptionKey: process.env.ENCRYPTION_KEY ?? "dev-only-insecure-key-base64-AAAAAAAAAAAAAAAAAAAAAAAAAAA=", // base64 of 32 bytes

  // Flinks (section 4.2)
  flinks: {
    // e.g. https://sandbox.flinks.io / https://api.private.fin.ag/v3/{customerId}
    apiUrl: process.env.FLINKS_API_URL ?? "",
    customerId: process.env.FLINKS_CUSTOMER_ID ?? "",
    // Public, safe for the browser (used by Flinks Connect widget).
    // Not secret; exposed via NEXT_PUBLIC_ by design.
    connectUrl:
      process.env.NEXT_PUBLIC_FLINKS_CONNECT_URL ??
      process.env.FLINKS_CONNECT_URL ??
      "",
    institutionId: process.env.FLINKS_INSTITUTION_ID ?? "",
    // Webhook shared secret for HMAC verification (section 4.4).
    webhookSecret: process.env.FLINKS_WEBHOOK_SECRET ?? "",
  },

  // Background worker (section 7)
  workerPollMs: Number(process.env.WORKER_POLL_MS ?? 2000),
  jobMaxAttempts: Number(process.env.JOB_MAX_ATTEMPTS ?? 5),
} as const;

export function assertProdSecrets() {
  if (!env.isProd) return;
  const missing: string[] = [];
  if (!process.env.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY");
  if (!env.isFlinksSimulator) {
    if (!env.flinks.apiUrl) missing.push("FLINKS_API_URL");
    if (!env.flinks.customerId) missing.push("FLINKS_CUSTOMER_ID");
    if (!env.flinks.webhookSecret) missing.push("FLINKS_WEBHOOK_SECRET");
  }
  if (missing.length > 0) {
    throw new Error(`Production requires env vars: ${missing.join(", ")}`);
  }
}
