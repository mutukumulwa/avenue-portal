import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey, getApiCredential, providerScopeWhere, operatorTenantWhere } from "@/lib/apiAuth";
import { ClaimLineCategory, ServiceType, Prisma } from "@prisma/client";
import { z } from "zod";
import { isFutureServiceDate, FUTURE_SERVICE_DATE_ERROR } from "@/lib/service-date";
import { coverageService, isCoverageEnded } from "@/server/services/coverage.service";

// BB2-DEF-01/02: strict intake validation. Invalid input must produce a 400
// with a field-level message — never a 201 with bad money, never a raw 500.
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
  dateOfService:    z.string().refine((s) => !Number.isNaN(Date.parse(s)), "dateOfService must be a valid date"),
  diagnoses:        z.array(DiagnosisSchema).min(1, "at least one diagnosis is required").max(20),
  lineItems:        z.array(LineItemSchema).min(1, "at least one line item is required").max(100),
  preauthReference: z.string().trim().max(60).optional(),
  externalRef:      z.string().trim().min(1).max(100).optional(),   // BB2-DEF-03 idempotency key
});

/**
 * POST /api/v1/claims
 *
 * Submits a claim from a provider facility system (SMART / Slade360).
 * Body: { memberNumber, providerCode, serviceType, dateOfService, diagnoses, lineItems, preauthReference?, externalRef? }
 */
async function postClaim(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = PostClaimSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { memberNumber, providerCode, serviceType, dateOfService, preauthReference } = parsed.data;

    // A per-facility key attributes the claim to its own provider (providerCode
    // is then optional and cannot be spoofed to another facility). The operator
    // key still resolves the provider from providerCode.
    const credential = await getApiCredential(req);
    const providerFromKey = credential?.kind === "provider" ? credential.providerId : null;

    if (!providerCode && !providerFromKey) {
      return NextResponse.json({ error: "providerCode is required when using an operator key" }, { status: 400 });
    }

    // PR-013: no intake channel accepts a future date of service.
    if (isFutureServiceDate(new Date(dateOfService))) {
      return NextResponse.json({ error: FUTURE_SERVICE_DATE_ERROR }, { status: 422 });
    }

    // BD-06: an operator key bound to a tenant may only file for that tenant's
    // members (no-op for provider keys and for an unbound operator).
    const member = await prisma.member.findFirst({
      where: { memberNumber, ...operatorTenantWhere(credential) },
      select: {
        id:             true,
        tenantId:       true,
        status:         true,
        enrollmentDate: true,
        group:          { select: { status: true } },
      },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // FG-C5 point-in-time coverage — cross-rail parity with runClaimIntake. When
    // coverage periods exist they are the authoritative as-of-SERVICE-date window
    // (a terminated member's in-window historical claim is eligible; a date outside
    // the window is not); otherwise fall back to the legacy current-status +
    // cover-start gate. (This rail had NO cover-start gate before — parity gap closed.)
    const svcDate = new Date(dateOfService);
    const coverage = await coverageService.evaluate(prisma, member.id, svcDate, {
      ignoreOpenPeriods: isCoverageEnded(member.status),
    });
    if (coverage.hasPeriods) {
      if (!coverage.covered) {
        return NextResponse.json({ error: "Member was not covered on the service date" }, { status: 403 });
      }
      if (["SUSPENDED", "LAPSED"].includes(member.status)) {
        return NextResponse.json({ error: `Member status is ${member.status} — not eligible` }, { status: 403 });
      }
    } else {
      if (["SUSPENDED", "LAPSED", "TERMINATED"].includes(member.status)) {
        return NextResponse.json({ error: `Member status is ${member.status} — not eligible` }, { status: 403 });
      }
      if (member.enrollmentDate && svcDate < member.enrollmentDate) {
        return NextResponse.json(
          { error: "Service date is before the member's coverage start — not covered" },
          { status: 403 },
        );
      }
    }
    if (["SUSPENDED", "LAPSED", "TERMINATED"].includes(member.group.status)) {
      return NextResponse.json({ error: `Group status is ${member.group.status} — not eligible` }, { status: 403 });
    }

    const provider = providerFromKey
      ? await prisma.provider.findFirst({ where: { id: providerFromKey } })
      : await prisma.provider.findFirst({ where: { slade360ProviderId: providerCode } });

    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }
    // A facility key can only file for its own tenant's members.
    if (provider.tenantId !== member.tenantId) {
      return NextResponse.json({ error: "Provider and member belong to different tenants" }, { status: 403 });
    }

    if (["EXPIRED", "SUSPENDED"].includes(provider.contractStatus)) {
      return NextResponse.json({ error: `Provider contract is ${provider.contractStatus}` }, { status: 403 });
    }

    // OBS-A3: normalise diagnoses to the canonical stored shape
    // { code, description, isPrimary } so the claim page renders them.
    const normalizedDiagnoses = parsed.data.diagnoses.map((d, i) =>
      typeof d === "string"
        ? { code: d, description: d, isPrimary: i === 0 }
        : { code: d.code, description: d.description ?? d.code, isPrimary: d.isPrimary ?? i === 0 }
    );

    // BB2-DEF-03: idempotent replay — an externalRef (body field or
    // Idempotency-Key header) matching a prior claim from this facility
    // returns the original claim instead of creating a second one.
    const idemKey = parsed.data.externalRef ?? req.headers.get("idempotency-key")?.trim() ?? null;
    if (idemKey) {
      const existing = await prisma.claim.findFirst({
        where: { tenantId: member.tenantId, providerId: provider.id, externalRef: idemKey },
        select: { claimNumber: true, status: true, billedAmount: true },
      });
      if (existing) {
        return NextResponse.json(
          {
            success:     true,
            duplicate:   true,
            claimNumber: existing.claimNumber,
            status:      existing.status,
            billedAmount: Number(existing.billedAmount),
            message:     "Duplicate submission — original claim returned (idempotent replay).",
          },
          { status: 200 }
        );
      }
    }

    // Sum line items (validated: every quantity ≥ 1, every unitCost > 0).
    const totalBilled = parsed.data.lineItems.reduce((s, l) => s + l.quantity * l.unitCost, 0);

    // BB2-DEF-03 fallback: without an idempotency key, block an identical claim
    // (same facility/member/service-date/total) captured in the last 2 minutes —
    // the same window the provider portal enforces (BD-02).
    const recentDuplicate = await prisma.claim.findFirst({
      where: {
        tenantId:      member.tenantId,
        providerId:    provider.id,
        memberId:      member.id,
        dateOfService: new Date(dateOfService),
        billedAmount:  totalBilled,
        createdAt:     { gte: new Date(Date.now() - 2 * 60 * 1000) },
      },
      select: { claimNumber: true },
      orderBy: { createdAt: "desc" },
    });
    if (recentDuplicate) {
      return NextResponse.json(
        {
          error:
            `Duplicate submission: an identical claim (${recentDuplicate.claimNumber}) for this member, ` +
            `service date and amount was received in the last 2 minutes. If this is a genuine distinct ` +
            `encounter, adjust a line or retry after 2 minutes. To make retries safe, send an Idempotency-Key header.`,
          claimNumber: recentDuplicate.claimNumber,
        },
        { status: 409 }
      );
    }

    // Resolve optional pre-auth linkage
    let preauthId: string | undefined;
    if (preauthReference) {
      const pa = await prisma.preAuthorization.findFirst({
        where: { preauthNumber: preauthReference, memberId: member.id },
      });
      if (pa && pa.status === "APPROVED") {
        preauthId = pa.id;
      }
    }

    // PR-017 D2: stamp the claim currency at intake.
    const { ClaimsService } = await import("@/server/services/claims.service");
    const currency = await ClaimsService.resolveClaimCurrency(member.tenantId, provider.id, member.id);

    // Everything except claimNumber — the number is assigned inside the
    // reservation loop below so a concurrency collision can be retried cleanly.
    const claimData = {
      tenantId:      member.tenantId,
      currency,
      externalRef:   idemKey,
      memberId:      member.id,
      providerId:    provider.id,
      // Attach the resolved PA (WP-C1): FK lives on PreAuthorization.claimId.
      preauths:      preauthId ? { connect: [{ id: preauthId }] } : undefined,
      source:        "SMART" as const,
      serviceType,
      dateOfService: new Date(dateOfService),
      diagnoses:     normalizedDiagnoses,
      procedures:    [],
      billedAmount:  totalBilled,
      approvedAmount: 0,
      copayAmount:   0,
      status:        "RECEIVED" as const,
      benefitCategory: "OUTPATIENT" as const, // default; adjudicator may override
      claimLines: {
        create: parsed.data.lineItems.map((l, idx) => ({
          lineNumber:      idx + 1,
          description:     l.description,
          quantity:        l.quantity,
          unitCost:        l.unitCost,
          billedAmount:    l.quantity * l.unitCost,
          approvedAmount:  0,
          serviceCategory: l.serviceCategory ?? ClaimLineCategory.OTHER,
          cptCode:         l.cptCode ?? null,
          icdCode:         normalizedDiagnoses[0].code,
        })),
      },
    };

    // TPA-DEF-01: the claim number was derived from a running `count()+1`, which
    // races under concurrent submission — two requests read the same count,
    // generate the same CLM-YYYY-NNNNN, and one hits the (tenantId, claimNumber)
    // unique index (P2002 → previously a raw 500 that dropped the claim).
    // Assign the number inside a bounded reservation loop: on a claimNumber
    // collision, advance to the next candidate and retry; an externalRef
    // collision is the idempotent-replay case (a concurrent request with the
    // same key won) and returns the original claim. Bounded, so extreme
    // per-tenant contention degrades to a retry-able 503, never a 500.
    // (For very high sustained concurrency a dedicated atomic counter row updated
    // with `UPDATE … RETURNING` would remove the retry entirely; this is the
    // minimal, schema-free fix.)
    const year = new Date().getFullYear();
    const baseCount = await prisma.claim.count({ where: { tenantId: member.tenantId } });
    const MAX_CLAIM_NUMBER_ATTEMPTS = 50;
    let claim: Awaited<ReturnType<typeof prisma.claim.create>> | undefined;
    for (let attempt = 0; attempt < MAX_CLAIM_NUMBER_ATTEMPTS; attempt++) {
      const claimNumber = `CLM-${year}-${String(baseCount + 1 + attempt).padStart(5, "0")}`;
      try {
        claim = await prisma.claim.create({ data: { ...claimData, claimNumber } });
        break;
      } catch (e) {
        const code = e instanceof Prisma.PrismaClientKnownRequestError
          ? e.code
          : (e as { code?: string })?.code;
        if (code === "P2002") {
          // BB2-DEF-03: idempotent replay — a concurrent request with the same
          // externalRef won the (tenantId, providerId, externalRef) index. Detect
          // it by finding the committed claim rather than by parsing
          // e.meta.target — its shape is connector-specific (Postgres returns the
          // constraint NAME string, not the field-name array), so a field-list
          // check silently misses.
          if (idemKey) {
            const existing = await prisma.claim.findFirst({
              where: { tenantId: member.tenantId, providerId: provider.id, externalRef: idemKey },
              select: { claimNumber: true, status: true, billedAmount: true },
            });
            if (existing) {
              return NextResponse.json(
                {
                  success:     true,
                  duplicate:   true,
                  claimNumber: existing.claimNumber,
                  status:      existing.status,
                  billedAmount: Number(existing.billedAmount),
                  message:     "Duplicate submission — original claim returned (idempotent replay).",
                },
                { status: 200 }
              );
            }
          }
          // TPA-DEF-01: otherwise this is a claimNumber collision under
          // concurrency (the only other unique index reachable here — invoiceNumber
          // is unset) → advance to the next candidate number and retry.
          continue;
        }
        throw e;
      }
    }
    if (!claim) {
      return NextResponse.json(
        { error: "Could not assign a unique claim number under load — please retry." },
        { status: 503 }
      );
    }

    // Stamp attachment state on the connected PA (WP-C2).
    if (preauthId) {
      await prisma.preAuthorization.update({
        where: { id: preauthId },
        data: { status: "ATTACHED", attachedAt: new Date() },
      });
    }

    // Run the same intake pipeline as the portal channels (fraud + engine
    // adjudication) so HMS-submitted claims are evaluated identically. The
    // system actor stands in for the API caller for audit attribution.
    const { FraudService } = await import("@/server/services/fraud.service");
    const { AutoAdjudicationService } = await import("@/server/services/auto-adjudication.service");
    const { getSystemActorId } = await import("@/server/services/system-actor.service");
    const systemActorId = await getSystemActorId(member.tenantId);
    await FraudService.evaluateClaim(claim.id, member.tenantId);
    await AutoAdjudicationService.processIntake(member.tenantId, claim.id, systemActorId);

    return NextResponse.json(
      {
        success:     true,
        claimNumber: claim.claimNumber,
        status:      claim.status,
        billedAmount: totalBilled,
        message:     "Claim received and queued for adjudication.",
      },
      { status: 201 }
    );
  } catch (error) {
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
