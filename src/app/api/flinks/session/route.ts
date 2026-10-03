// POST /api/flinks/session — initiate/complete Flinks connection workflow
// (section 4.2, section 8). In simulator mode this immediately authorizes
// and creates the connection; with real Flinks, `requestId` comes from the
// Flinks Connect widget callback.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, parseBody } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { flinks } from "@/lib/flinks/client";
import { enqueue } from "@/lib/jobs";
import { env } from "@/lib/config";

const schema = z.object({
  institutionSlug: z.string().min(1).max(100),
  requestId: z.string().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await parseBody(req, schema);

    // Institution must be known internally (section 4.6: provider->internal
    // institution id mapping).
    const institution = await prisma.institution.upsert({
      where: { providerSlug: body.institutionSlug },
      create: {
        providerSlug: body.institutionSlug,
        name:
          flinks.listInstitutions().find((i) => i.providerSlug === body.institutionSlug)
            ?.name ?? body.institutionSlug,
      },
      update: {},
    });

    const requestId = body.requestId ?? `req-${crypto.randomUUID()}`;

    // Exchange the Connect result for accounts + tokens (server-side only).
    const result = await flinks.authorize(requestId, body.institutionSlug);

    const connection = await prisma.providerConnection.create({
      data: {
        userId: user.id,
        institutionId: institution.id,
        flinksRequestId: result.requestId,
        flinksLinkId: result.linkId,
        accessTokenEnc: result.accessToken ? encrypt(result.accessToken) : null,
        refreshTokenEnc: result.refreshToken ? encrypt(result.refreshToken) : null,
        status: "PENDING",
      },
    });

    // Initial data fetch happens in the background (section 7).
    await enqueue(
      "sync_connection",
      { connectionId: connection.id, trigger: "MANUAL" },
      { priority: 20 }
    );

    return ok(
      {
        connectionId: connection.id,
        institution: result.institution.name,
        accountsExpected: result.accounts.length,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) return fail(400, "Validation failed");
    console.error("[flinks/session]", err);
    return fail(500, "Failed to establish connection");
  }
}

// Institutions available for the Connect picker (public to the user).
export async function GET() {
  try {
    await requireUser();
    return ok({
      institutions: flinks.listInstitutions(),
      mode: env.isFlinksSimulator ? "simulator" : "live",
      connectUrl: env.isFlinksSimulator ? null : env.flinks.connectUrl || null,
    });
  } catch {
    return fail(401, "Unauthorized");
  }
}
