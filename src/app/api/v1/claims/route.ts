import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey } from "@/lib/apiAuth";
import { ClaimLineCategory } from "@prisma/client";

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

    if (!memberNumber || !providerCode || !serviceType || !dateOfService || !diagnoses || !lineItems) {
      return NextResponse.json(
        { error: "Missing required fields: memberNumber, providerCode, serviceType, dateOfService, diagnoses, lineItems" },
        { status: 400 }
      );
    }

    const member = await prisma.member.findFirst({
      where: { memberNumber },
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

    const provider = await prisma.provider.findFirst({
      where: { slade360ProviderId: providerCode },
    });

    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
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

    const claim = await prisma.claim.create({
      data: {
        tenantId:      member.tenantId,
        claimNumber,
        memberId:      member.id,
        providerId:    provider.id,
        preauthId:     preauthId ?? null,
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

    const claim = await prisma.claim.findFirst({
      where: { claimNumber },
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
