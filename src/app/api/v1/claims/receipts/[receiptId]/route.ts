import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey, getApiCredential } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rate-limit";
import { getReason, isRouteCode } from "@/server/services/claim-intake/reason-catalog";

/**
 * GET /api/v1/claims/receipts/{receiptId} — authoritative intake-receipt status
 * (F5.2, §8.6 "timeout after acceptance"). An integrator that timed out on POST
 * queries the receipt it holds (or simply retries the same Idempotency-Key).
 *
 * Scope (D12, non-enumerating): a facility key reads only receipts submitted
 * under its own provider scope; an operator key must be tenant-bound and reads
 * within its tenant. Anything else is a 404 — existence is never leaked.
 */
async function getReceipt(req: Request, ...args: unknown[]) {
  try {
    const { params } = (args[0] ?? {}) as { params?: Promise<{ receiptId: string }> };
    const receiptId = params ? (await params).receiptId : undefined;
    if (!receiptId) return NextResponse.json({ error: "Missing receiptId" }, { status: 400 });

    const credential = await getApiCredential(req);
    if (!credential) return NextResponse.json({ error: "Unauthorized. Invalid or missing API Key." }, { status: 401 });
    // F6.1: dampen scraping/enumeration per credential.
    const limiterKey = credential.kind === "provider" ? `rcpt:${credential.keyId}` : "rcpt:operator";
    const limit = rateLimit(limiterKey, 60, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many receipt lookups — slow down and retry." },
        { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
      );
    }
    const tenantId = credential.tenantId; // provider keys always carry one
    if (!tenantId) {
      return NextResponse.json(
        { error: "Operator key must be tenant-bound (OPERATOR_TENANT_ID) to read receipts." },
        { status: 403 },
      );
    }

    const receipt = await prisma.claimIntakeReceipt.findFirst({
      where: {
        id: receiptId,
        tenantId,
        ...(credential.kind === "provider" ? { scopeKey: `provider:${credential.providerId}` } : {}),
      },
      select: {
        id: true,
        claimId: true,
        state: true,
        outcomeCode: true,
        correlationId: true,
        completedAt: true,
        createdAt: true,
        claim: { select: { claimNumber: true, status: true, processingState: true } },
      },
    });
    if (!receipt) {
      // F6.1: a miss is either a typo or an enumeration probe — audit it
      // (best-effort, non-enumerating response either way).
      const { auditChainService } = await import("@/server/services/audit-chain.service");
      const { getSystemActorId } = await import("@/server/services/system-actor.service");
      const actorId = await getSystemActorId(tenantId).catch(() => null);
      if (actorId) {
        await auditChainService
          .append({
            actorId, action: "CLAIM:RECEIPT_LOOKUP_MISS", module: "CLAIMS", entityType: "ClaimIntakeReceipt", entityId: receiptId,
            payload: { credentialKind: credential.kind, providerId: credential.kind === "provider" ? credential.providerId : null },
            tenantId, description: `Receipt lookup miss for ${receiptId} (${credential.kind} credential)`,
          })
          .catch(() => undefined);
      }
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    // F6.1: a caller-actionable next step derived from the routed reason.
    const routeCode = receipt.claim?.processingState === "ROUTED" ? await prisma.claim.findUnique({ where: { id: receipt.claimId ?? "" }, select: { processingRouteCode: true } }).then((c) => c?.processingRouteCode ?? null) : null;
    const nextAction =
      receipt.state === "PROCESSING"
        ? "Submission accepted and still processing — retry this lookup shortly, or resubmit with the same Idempotency-Key."
        : receipt.claim?.processingState === "FAILED"
          ? "Processing failed and is queued for operator attention — no action needed from you; the claim is safe."
          : routeCode && isRouteCode(routeCode)
            ? getReason(routeCode).provider
            : receipt.claim
              ? "The claim is in the adjudication pipeline — check claim status for the decision."
              : "The submission did not create a claim — contact support with this receipt id.";

    return NextResponse.json({
      nextAction,
      receiptId: receipt.id,
      state: receipt.state,
      outcomeCode: receipt.outcomeCode,
      correlationId: receipt.correlationId,
      claimNumber: receipt.claim?.claimNumber ?? null,
      claimStatus: receipt.claim?.status ?? null,
      processingState: receipt.claim?.processingState ?? null,
      submittedAt: receipt.createdAt.toISOString(),
      completedAt: receipt.completedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("Receipt status API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export const GET = withApiKey(getReceipt);
