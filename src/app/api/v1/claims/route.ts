import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey, getApiCredential, providerScopeWhere, operatorTenantWhere } from "@/lib/apiAuth";
import { ClaimLineCategory } from "@prisma/client";
import { isFutureServiceDate, FUTURE_SERVICE_DATE_ERROR } from "@/lib/service-date";

/**
 * POST /api/v1/claims
 *
 * Submits a claim from a provider facility system (SMART / Slade360).
 * Body: { memberNumber, providerCode, serviceType, dateOfService, diagnoses, lineItems, preauthReference? }
 */
async function postClaim(req: Request) {
  try {
    const body = await req.json();
    const {
      memberNumber,
      providerCode,
      serviceType,
      dateOfService,
      diagnoses,
      lineItems,
      preauthReference,
    } = body;

    // A per-facility key attributes the claim to its own provider (providerCode
    // is then optional and cannot be spoofed to another facility). The operator
    // key still resolves the provider from providerCode.
    const credential = await getApiCredential(req);
    const providerFromKey = credential?.kind === "provider" ? credential.providerId : null;

    if (!memberNumber || (!providerCode && !providerFromKey) || !serviceType || !dateOfService || !diagnoses || !lineItems) {
      return NextResponse.json(
        { error: "Missing required fields: memberNumber, providerCode, serviceType, dateOfService, diagnoses, lineItems" },
        { status: 400 }
      );
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
        id:       true,
        tenantId: true,
        status:   true,
        group:    { select: { status: true } },
      },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const BLOCKED = ["SUSPENDED", "LAPSED", "TERMINATED"];
    if (BLOCKED.includes(member.status)) {
      return NextResponse.json({ error: `Member status is ${member.status} — not eligible` }, { status: 403 });
    }
    if (BLOCKED.includes(member.group.status)) {
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

    // Generate claim number
    const count = await prisma.claim.count({ where: { tenantId: member.tenantId } });
    const claimNumber = `CLM-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    // Sum line items
    const totalBilled = (lineItems as { quantity: number; unitCost: number }[]).reduce(
      (sum, l) => sum + l.quantity * l.unitCost,
      0
    );

    // PR-017 D2: stamp the claim currency at intake.
    const { ClaimsService } = await import("@/server/services/claims.service");
    const currency = await ClaimsService.resolveClaimCurrency(member.tenantId, provider.id, member.id);

    const claim = await prisma.claim.create({
      data: {
        tenantId:      member.tenantId,
        claimNumber,
        currency,
        memberId:      member.id,
        providerId:    provider.id,
        // Attach the resolved PA (WP-C1): FK lives on PreAuthorization.claimId.
        preauths:      preauthId ? { connect: [{ id: preauthId }] } : undefined,
        source:        "SMART",
        serviceType,
        dateOfService: new Date(dateOfService),
        diagnoses,
        procedures:    [],
        billedAmount:  totalBilled,
        approvedAmount: 0,
        copayAmount:   0,
        status:        "RECEIVED",
        benefitCategory: "OUTPATIENT", // default; adjudicator may override
        claimLines: {
          create: (lineItems as { description: string; quantity: number; unitCost: number; cptCode?: string; serviceCategory?: string }[]).map(
            (l, idx) => ({
              lineNumber:      idx + 1,
              description:     l.description,
              quantity:        l.quantity,
              unitCost:        l.unitCost,
              billedAmount:    l.quantity * l.unitCost,
              approvedAmount:  0,
              serviceCategory: (l.serviceCategory as ClaimLineCategory) ?? ClaimLineCategory.OTHER,
              cptCode:         l.cptCode ?? null,
            })
          ),
        },
      },
    });

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
