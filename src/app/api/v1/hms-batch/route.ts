import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey } from "@/lib/apiAuth";
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

    // TODO(G8): map the API key → operator tenant. Single-operator scaffold
    // resolves the sole tenant (mirrors /api/v1/sync).
    const tenant = await prisma.tenant.findFirst({ select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "No operator tenant" }, { status: 500 });

    const report = await HmsBatchService.apply(tenant.id, body);
    return NextResponse.json({ success: true, ...report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "HMS batch ingest failed" },
      { status: 400 },
    );
  }
}

export const POST = withApiKey(postHmsBatch);
