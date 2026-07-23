import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey, getApiCredential, providerScopeWhere, operatorTenantWhere, type ApiCredential } from "@/lib/apiAuth";
import { ClaimLineCategory, ServiceType, BenefitCategory } from "@prisma/client";
import { z } from "zod";
import { LIMITS } from "@/server/services/claim-intake/schema";
import { ClaimIntakeService } from "@/server/services/claim-intake/intake.service";
import { processAcceptedRunInline } from "@/server/services/claim-intake";
import { IntakeError, toHttpResponse } from "@/server/services/claim-intake/errors";
import type { CallerIdentity } from "@/server/services/claim-intake/context";
import type { PersistOrigin } from "@/server/services/claim-intake/persist";

/**
 * B2B claim intake (F5.2) — this route is now an ADAPTER over the canonical
 * `ClaimIntakeService`. It keeps the integrator-facing body shape (memberNumber /
 * lineItems / diagnoses / externalRef …) and maps it onto `ClaimSubmissionV1`;
 * validation, scope derivation, fingerprints, receipts, persistence and staged
 * evaluation are all canonical. No direct `Claim.create` remains here.
 *
 * Contract (§8.5/§8.6):
 *  - `Idempotency-Key` header REQUIRED for new submissions (422 without it);
 *    a resend of an EXISTING claim's `externalRef` still replays (legacy
 *    behavior retained — works across the migration boundary).
 *  - 201 accepted (+ receiptId/correlationId/processingState), 200 replay/link
 *    (`replayed: true`, legacy `duplicate: true` kept), 409 same-key-different-
 *    payload, 422 structural, 401/403 non-enumerating, 503 transient.
 *  - Business-rule failures (eligibility/benefit/PA) are ACCEPTED-and-ROUTED
 *    (D6) — they are claims with a receipt, not HTTP errors.
 *  - Provider/tenant derive from the credential (D12): a facility key may not
 *    name another facility; an operator key must be tenant-bound to submit.
 */

// Legacy integrator body shape — kept stable; `invoiceNumber`/`benefitCategory`
// are additive. Structural failures now return 422 (§8.6; was 400).
const LineItemSchema = z.object({
  description:     z.string().trim().min(1, "description is required").max(300),
  quantity:        z.number().int("quantity must be a whole number").min(1, "quantity must be at least 1").max(1000),
  unitCost:        z.number().positive("unitCost must be greater than 0").finite().max(1_000_000_000),
  cptCode:         z.string().trim().max(20).optional(),
  serviceCategory: z.nativeEnum(ClaimLineCategory).optional(),
});

const DiagnosisSchema = z.union([
  z.string().trim().min(1).max(20),
  z.object({
    code:        z.string().trim().min(1, "diagnosis code is required").max(20),
    description: z.string().trim().max(300).optional(),
    isPrimary:   z.boolean().optional(),
  }),
]);

const PostClaimSchema = z.object({
  memberNumber:     z.string().trim().min(1),
  providerCode:     z.string().trim().min(1).optional(),
  serviceType:      z.nativeEnum(ServiceType),
  benefitCategory:  z.nativeEnum(BenefitCategory).optional(), // additive; defaults to OUTPATIENT as before
  dateOfService:    z.string().refine((s) => !Number.isNaN(Date.parse(s)), "dateOfService must be a valid date"),
  diagnoses:        z.array(DiagnosisSchema).min(1, "at least one diagnosis is required").max(20),
  lineItems:        z.array(LineItemSchema).min(1, "at least one line item is required").max(100),
  preauthReference: z.string().trim().max(60).optional(),
  externalRef:      z.string().trim().min(1).max(100).optional(),
  invoiceNumber:    z.string().trim().min(1).max(100).optional(), // additive; enables cross-channel invoice dedup (§8.3.1)
});

interface ResolvedCaller {
  identity: CallerIdentity;
  tenantId: string;
  /** Provider the submission is for (derived or selected). */
  providerId: string;
  /** providerId to place in the submission body (operator selection); null when derived. */
  submissionProviderId: string | null;
}

/** Derive the canonical caller + provider from the API credential (D12). */
async function resolveCaller(credential: ApiCredential, providerCode: string | undefined): Promise<ResolvedCaller | NextResponse> {
  if (credential.kind === "provider") {
    // A facility key is its own provider. A body providerCode naming a DIFFERENT
    // facility is rejected (never silently re-attributed).
    if (providerCode) {
      const named = await prisma.provider.findFirst({
        where: { slade360ProviderId: providerCode, tenantId: credential.tenantId },
        select: { id: true },
      });
      if (!named || named.id !== credential.providerId) {
        return NextResponse.json(
          { error: "Submitted provider does not match the authenticated provider." },
          { status: 403 },
        );
      }
    }
    return {
      identity: { kind: "providerKey", tenantId: credential.tenantId, providerId: credential.providerId, keyId: credential.keyId },
      tenantId: credential.tenantId,
      providerId: credential.providerId,
      submissionProviderId: null, // derived from the credential
    };
  }

  // Operator/global integration key: must be tenant-bound to submit claims
  // (BD-06 posture — an unbound operator cannot derive a trusted tenant).
  if (!credential.tenantId) {
    return NextResponse.json(
      { error: "Operator key must be tenant-bound (OPERATOR_TENANT_ID) to submit claims." },
      { status: 403 },
    );
  }
  if (!providerCode) {
    return NextResponse.json(
      { error: "providerCode is required when using an operator key", success: false, code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }
  const provider = await prisma.provider.findFirst({
    where: { slade360ProviderId: providerCode, tenantId: credential.tenantId },
    select: { id: true },
  });
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }
  return {
    identity: { kind: "integrationKey", tenantId: credential.tenantId, keyId: "operator", sourceHint: "SMART" },
    tenantId: credential.tenantId,
    providerId: provider.id,
    submissionProviderId: provider.id, // operator selects; context validates within tenant
  };
}

async function postClaim(req: Request) {
  try {
    // F7.3: bounded request body — refuse oversized payloads before parsing.
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > LIMITS.MAX_BODY_BYTES) {
      return NextResponse.json({ error: `Request body exceeds ${LIMITS.MAX_BODY_BYTES} bytes.` }, { status: 413 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = PostClaimSchema.safeParse(body);
    if (!parsed.success) {
      // §8.6: structurally invalid ⇒ 422 with field issues (was 400).
      return NextResponse.json(
        { error: "Validation failed", success: false, code: "VALIDATION_FAILED", details: parsed.error.flatten().fieldErrors },
        { status: 422 },
      );
    }
    const data = parsed.data;

    const credential = await getApiCredential(req);
    if (!credential) return NextResponse.json({ error: "Unauthorized. Invalid or missing API Key." }, { status: 401 });
    const resolved = await resolveCaller(credential, data.providerCode);
    if (resolved instanceof NextResponse) return resolved;

    // Legacy replay (retained): a resend of an already-accepted claim's
    // externalRef from this facility returns the ORIGINAL claim — including
    // claims accepted BEFORE this migration (the canonical persist keeps
    // storing `Claim.externalRef`, so this works on both sides of the boundary).
    if (data.externalRef) {
      const existing = await prisma.claim.findFirst({
        where: { tenantId: resolved.tenantId, providerId: resolved.providerId, externalRef: data.externalRef },
        select: { claimNumber: true, status: true, billedAmount: true },
      });
      if (existing) {
        return NextResponse.json(
          {
            success: true,
            duplicate: true,
            replayed: true,
            claimNumber: existing.claimNumber,
            status: existing.status,
            billedAmount: Number(existing.billedAmount),
            message: "Duplicate submission — original claim returned (idempotent replay).",
          },
          { status: 200 },
        );
      }
    }

    // §8.5: the Idempotency-Key header is REQUIRED for new submissions; the body
    // externalRef strengthens identity but does not replace the key.
    const idempotencyKey = req.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return NextResponse.json(
        {
          error: "Idempotency-Key header is required. Send a stable unique key per submission so retries are safe.",
          success: false,
          code: "IDEMPOTENCY_KEY_REQUIRED",
        },
        { status: 422 },
      );
    }

    // Diagnoses → canonical shape with exactly one primary (first flagged wins;
    // none flagged ⇒ the first diagnosis, matching the legacy default).
    const dxRaw = data.diagnoses.map((d, i) =>
      typeof d === "string"
        ? { code: d, description: d, isPrimary: i === 0 }
        : { code: d.code, description: d.description ?? d.code, isPrimary: d.isPrimary ?? i === 0 },
    );
    const flagged = dxRaw.findIndex((d) => d.isPrimary);
    const primaryIdx = flagged === -1 ? 0 : flagged;
    const primaryCode = dxRaw[primaryIdx].code;

    // Optional PA linkage (legacy semantics preserved: only an APPROVED PA for
    // THIS member attaches; anything else is silently ignored). Attach happens
    // atomically inside the canonical persist via `origin.preauthId`.
    const origin: PersistOrigin = {};
    if (data.preauthReference) {
      const member = await prisma.member.findFirst({
        where: { tenantId: resolved.tenantId, memberNumber: data.memberNumber },
        select: { id: true },
      });
      if (member) {
        const pa = await prisma.preAuthorization.findFirst({
          where: { preauthNumber: data.preauthReference, memberId: member.id, tenantId: resolved.tenantId },
          select: { id: true, status: true },
        });
        if (pa?.status === "APPROVED") origin.preauthId = pa.id;
      }
    }

    const submission = {
      schemaVersion: "1" as const,
      idempotencyKey,
      ...(data.externalRef ? { externalClaimRef: data.externalRef } : {}),
      ...(data.invoiceNumber ? { invoiceNumber: data.invoiceNumber } : {}),
      member: { memberNumber: data.memberNumber },
      provider: resolved.submissionProviderId ? { providerId: resolved.submissionProviderId } : {},
      encounter: {
        serviceType: data.serviceType,
        benefitCategory: data.benefitCategory ?? ("OUTPATIENT" as const),
        serviceFrom: data.dateOfService,
      },
      diagnoses: dxRaw.map((d, i) => ({ code: d.code, description: d.description, isPrimary: i === primaryIdx })),
      lines: data.lineItems.map((l) => ({
        serviceCategory: l.serviceCategory ?? ("OTHER" as const),
        ...(l.cptCode?.trim() ? { cptCode: l.cptCode.trim() } : {}),
        icdCode: primaryCode, // legacy behavior: lines carry the primary diagnosis code
        description: l.description,
        quantity: l.quantity,
        unitCost: l.unitCost,
        billedAmount: Math.round(l.quantity * l.unitCost * 100) / 100,
      })),
      ...(data.preauthReference ? { preauthRefs: [data.preauthReference] } : {}),
    };

    const result = await ClaimIntakeService.submit(resolved.identity, submission, { origin });

    // Replay of a receipt still mid-persist (crash recovery window): the sweep
    // completes it; the caller checks the receipt status route.
    if (!result.claimId) {
      return NextResponse.json(
        {
          success: true,
          processing: true,
          receiptId: result.receiptId,
          correlationId: result.correlationId,
          message: "Submission accepted and still processing — check the receipt status endpoint.",
        },
        { status: 202 },
      );
    }

    // D9: decide in-request when possible; the durable run + recovery sweep
    // remain the authoritative backstop.
    if (result.outcome === "ACCEPTED") {
      await processAcceptedRunInline(result.claimId);
    }

    const claim = await prisma.claim.findUnique({
      where: { id: result.claimId },
      select: { claimNumber: true, status: true, billedAmount: true, processingState: true },
    });
    const replay = result.outcome !== "ACCEPTED";
    return NextResponse.json(
      {
        success: true,
        ...(replay ? { duplicate: true, replayed: true } : {}),
        claimNumber: claim?.claimNumber ?? result.claimNumber,
        status: claim?.status ?? "RECEIVED",
        billedAmount: Number(claim?.billedAmount ?? 0),
        receiptId: result.receiptId,
        correlationId: result.correlationId,
        processingState: claim?.processingState ?? result.processingState,
        message: replay
          ? "Duplicate submission — original claim returned (idempotent replay)."
          : "Claim received and queued for adjudication.",
      },
      { status: replay ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof IntakeError) {
      const { status, body: eb } = toHttpResponse(error);
      // Keep the legacy `error` field alongside the canonical shape.
      return NextResponse.json({ error: eb.message, ...eb }, { status });
    }
    console.error("Claims API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * GET /api/v1/claims?claimNumber=CLM-2025-00001
 *
 * Returns claim status for a facility to check on a submitted claim.
 */
async function getClaim(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const claimNumber = searchParams.get("claimNumber");

    if (!claimNumber) {
      return NextResponse.json({ error: "Missing claimNumber parameter" }, { status: 400 });
    }

    // E2E-D02: a facility key may only read its own claims. A claim belonging to
    // another facility resolves to null and returns the existing 404 shape.
    const credential = await getApiCredential(req);

    const claim = await prisma.claim.findFirst({
      where: { claimNumber, ...providerScopeWhere(credential), ...operatorTenantWhere(credential) },
      select: {
        claimNumber:   true,
        status:        true,
        billedAmount:  true,
        approvedAmount: true,
        copayAmount:   true,
        dateOfService: true,
        createdAt:     true,
        member: { select: { memberNumber: true, firstName: true, lastName: true } },
        provider: { select: { name: true } },
      },
    });

    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    return NextResponse.json({
      claimNumber:    claim.claimNumber,
      status:         claim.status,
      member:         `${claim.member.firstName} ${claim.member.lastName} (${claim.member.memberNumber})`,
      provider:       claim.provider.name,
      dateOfService:  claim.dateOfService.toISOString().split("T")[0],
      billedAmount:   Number(claim.billedAmount),
      approvedAmount: Number(claim.approvedAmount),
      copayAmount:    Number(claim.copayAmount),
      submittedAt:    claim.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Claims GET API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export const POST = withApiKey(postClaim);
export const GET  = withApiKey(getClaim);
