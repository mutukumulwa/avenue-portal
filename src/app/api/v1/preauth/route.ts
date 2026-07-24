import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { withApiKey, getApiCredential, providerScopeError } from "@/lib/apiAuth";
import { ROUTE_SCOPE_CATALOG } from "@/lib/provider-api-scopes";
import { PreauthIntakeService, PreauthIntakeConflict } from "@/server/services/preauth-intake/service";
import type { PreauthCallerContext, PreauthSubmissionV1 } from "@/server/services/preauth-intake/contract";
import { preauthAdjudicationService } from "@/server/services/preauth-adjudication.service";
import { getSystemActorId } from "@/server/services/system-actor.service";

/**
 * B2B pre-authorisation intake (F3.4) — this route is now an ADAPTER over the
 * canonical PreauthIntakeService. It keeps the integrator-facing body shape
 * (memberNumber / providerCode / diagnoses / …) and its backward-compatible
 * response fields (success/reference/status/message), but normalization,
 * idempotency, the intake receipt, PA creation, the SUBMITTED event and the
 * adjudication handoff are all canonical. No direct `preAuthorization.create`
 * remains here. Requires the api.preauth.write scope (F1.7).
 */

// Post-commit handoff to the canonical decision/hold owner (idempotent).
async function adjudicate(preAuthId: string, tenantId: string) {
  await preauthAdjudicationService.executeAutoDecision(preAuthId, tenantId, await getSystemActorId(tenantId));
}

function mapDiagnoses(d: unknown): PreauthSubmissionV1["diagnoses"] {
  if (!Array.isArray(d)) return [];
  return d.map((x) =>
    typeof x === "string"
      ? { icdCode: x, description: x }
      : { code: x?.code, icdCode: x?.icdCode, description: x?.description, isPrimary: x?.isPrimary },
  );
}

/** Map a canonical rejection code to a safe HTTP status. */
function rejectStatus(code: string | undefined): number {
  if (code === "MEMBER_NOT_FOUND" || code === "MISSING_MEMBER_IDENTIFIER") return 404;
  if (code === "PROVIDER_NOT_ACTIVE" || code === "PROVIDER_FORGERY" || code === "MEMBER_NOT_ACTIVE") return 403;
  return 422; // structurally valid but invalid command — no PA created (§9.3)
}

async function postPreAuth(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  try {
    const credential = await getApiCredential(req);
    if (!credential) return NextResponse.json({ success: false, requestId, error: { code: "UNAUTHORIZED", message: "Invalid or missing API key", retryable: false } }, { status: 401 });

    // F1.7: this route requires the PA-write scope (unscoped legacy keys pass).
    const scopeErr = providerScopeError(credential, ROUTE_SCOPE_CATALOG["preauth.submit"]);
    if (scopeErr) return scopeErr;

    const body = await req.json().catch(() => ({}));
    const { memberNumber, providerCode, benefitCategory, serviceType, diagnoses, procedures, estimatedCost, notes, expectedDateOfService } = body ?? {};

    // Resolve the acting provider (code → id). A provider key is bound to its own
    // facility and cannot spoof providerCode to another (preserved from E2E-D04).
    const providerFromKey = credential.kind === "provider" ? credential.providerId : null;
    const provider = providerFromKey
      ? await prisma.provider.findFirst({ where: { id: providerFromKey }, select: { id: true, tenantId: true, slade360ProviderId: true } })
      : providerCode
        ? await prisma.provider.findFirst({ where: { slade360ProviderId: providerCode }, select: { id: true, tenantId: true, slade360ProviderId: true } })
        : null;
    if (!provider) return NextResponse.json({ success: false, requestId, error: { code: "PROVIDER_NOT_FOUND", message: "Provider not found", retryable: false } }, { status: 404 });
    if (providerFromKey && providerCode && provider.slade360ProviderId && providerCode !== provider.slade360ProviderId) {
      return NextResponse.json({ success: false, requestId, error: { code: "PROVIDER_MISMATCH", message: "Provider code does not match the authenticated facility", retryable: false } }, { status: 403 });
    }

    const ctx: PreauthCallerContext = {
      channel: "PROVIDER_API",
      tenantId: provider.tenantId,
      providerId: provider.id,
      providerBranchId: null,
      actorType: credential.kind === "provider" ? "API_KEY" : "SYSTEM",
      actorId: credential.kind === "provider" ? credential.keyId : "operator",
      requestId,
    };
    const submission: PreauthSubmissionV1 = {
      memberNumber,
      benefitCategory,
      serviceType,
      diagnoses: mapDiagnoses(diagnoses),
      procedures: Array.isArray(procedures) ? procedures : [],
      estimatedCost,
      clinicalNotes: notes,
      expectedDateOfService,
      idempotencyKey: req.headers.get("idempotency-key") ?? undefined,
    };

    const result = await PreauthIntakeService.submit(ctx, submission, { adjudicate });

    if (result.status === "REJECTED") {
      const code = result.errors?.[0]?.code;
      return NextResponse.json(
        { success: false, requestId, receipt: { id: result.receiptId, status: "REJECTED", replayed: result.replayed }, error: { code: code ?? "REJECTED", message: result.errors?.[0]?.message ?? "Pre-authorisation was rejected", fieldErrors: result.errors, retryable: false } },
        { status: rejectStatus(code) },
      );
    }

    // ACCEPTED — look up the human reference (preauthNumber) for backward compat.
    const pa = result.preauthId ? await prisma.preAuthorization.findUnique({ where: { id: result.preauthId }, select: { preauthNumber: true, status: true } }) : null;
    return NextResponse.json(
      {
        success: true,
        requestId,
        reference: pa?.preauthNumber, // legacy field
        status: pa?.status ?? "SUBMITTED", // legacy field
        receipt: { id: result.receiptId, status: "ACCEPTED", replayed: result.replayed },
        preauthId: result.preauthId,
        message: result.replayed ? "Pre-authorisation already received (idempotent replay)." : "Pre-authorization received and queued for review.",
      },
      { status: result.replayed ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof PreauthIntakeConflict) {
      return NextResponse.json({ success: false, requestId, error: { code: "IDEMPOTENCY_CONFLICT", message: "This idempotency key was already used with a different request", retryable: false }, receipt: { id: error.receiptId, status: "CONFLICT", replayed: false } }, { status: 409 });
    }
    console.error("Preauth API Error:", error);
    return NextResponse.json({ success: false, requestId, error: { code: "INTERNAL", message: "Internal Server Error", retryable: true } }, { status: 500 });
  }
}

export const POST = withApiKey(postPreAuth);
