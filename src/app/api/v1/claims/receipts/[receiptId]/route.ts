import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey, getApiCredential } from "@/lib/apiAuth";

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
        state: true,
        outcomeCode: true,
        correlationId: true,
        completedAt: true,
        createdAt: true,
        claim: { select: { claimNumber: true, status: true, processingState: true } },
      },
    });
    if (!receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

    return NextResponse.json({
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
