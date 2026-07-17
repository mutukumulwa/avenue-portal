import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey, getApiCredential } from "@/lib/apiAuth";
import { looksLowLevel } from "@/lib/safe-action-error";
import { HmsBatchService } from "@/server/services/hms-batch.service";

/**
 * POST /api/v1/hms-batch  (WP-D4)
 *
 * Daily service batch from a facility HMS against open clinical cases.
 * Idempotent by (batchRef, line hash) — safe to retry. Unmatched lines land in
 * the exceptions queue; nothing is dropped. See HmsBatchService for the
 * versioned payload format.
 */
async function postHmsBatch(req: Request) {
  try {
    const body = await req.json();
    HmsBatchService.validate(body);

    // FG-C3: bind the batch to the authenticated key. A per-facility key can
    // only file for its OWN facility (providerFromKey); the payload facilityCode
    // cannot retarget another facility. An operator key still resolves the
    // facility from the payload.
    const credential = await getApiCredential(req);
    const providerFromKey = credential?.kind === "provider" ? credential.providerId : null;

    // OBS-D2/G8: prefer the key's tenant; fall back to the single-operator
    // scaffold only for an unbound operator key.
    const tenantId =
      credential?.tenantId ?? (await prisma.tenant.findFirst({ select: { id: true } }))?.id;
    if (!tenantId) return NextResponse.json({ error: "No operator tenant" }, { status: 500 });

    const report = await HmsBatchService.apply(tenantId, body, providerFromKey ?? undefined);
    return NextResponse.json({ success: true, ...report });
  } catch (err) {
    // IP-DEF-05 hardening: validation errors (missing facilityCode/batchRef,
    // malformed entries) → 400 with the field message; infrastructure errors
    // → 500 with a generic body (never leak Prisma/SQL internals on the API).
    if (err instanceof Error && !looksLowLevel(err)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[hms-batch] ingest failed", err);
    return NextResponse.json({ error: "HMS batch ingest failed — contact the operator." }, { status: 500 });
  }
}

export const POST = withApiKey(postHmsBatch);
