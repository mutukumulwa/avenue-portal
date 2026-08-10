import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey, getApiCredential, operatorTenantWhere } from "@/lib/apiAuth";
import { ProviderEntitlementService } from "@/server/services/provider-entitlement.service";
import { BenefitUsageService } from "@/server/services/benefit-usage.service";

/**
 * GET /api/v1/benefits?memberNumber=AV-2025-00001
 *
 * Returns the member's active benefit configuration and remaining balances.
 * Consumed by SMART / Slade360 facility systems before issuing services.
 */
async function getBenefits(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const memberNumber = searchParams.get("memberNumber");

    if (!memberNumber) {
      return NextResponse.json({ error: "Missing memberNumber parameter" }, { status: 400 });
    }

    // E2E-D02: a per-facility key may only read benefit balances / PII of
    // members whose client its contracts cover (404 otherwise). The operator key
    // is confined to its bound tenant (BD-06 / operatorTenantWhere).
    const credential = await getApiCredential(req);
    const scope =
      credential?.kind === "provider"
        ? await ProviderEntitlementService.entitledMemberWhere(credential.providerId)
        : operatorTenantWhere(credential);

    const member = await prisma.member.findFirst({
      where: { memberNumber, ...scope },
      select: {
        id:               true,
        memberNumber:     true,
        firstName:        true,
        lastName:         true,
        status:           true,
        relationship:     true,
        packageId:        true,
        packageVersionId: true,
        group:            { select: { name: true, status: true } },
        package:          { select: { name: true } },
      },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (member.status !== "ACTIVE" || member.group.status !== "ACTIVE") {
      return NextResponse.json(
        {
          error:        "Member or group is not active",
          memberStatus: member.status,
          groupStatus:  member.group.status,
        },
        { status: 403 }
      );
    }

    // F-PIN-1 (S2, money-affecting): resolve the member's PINNED package version —
    // the version adjudication/cost-share/usage actually price against — NEVER the
    // latest by versionNumber (which could quote limits the payer will not honour).
    // Unpinned (F-PIN-2) fails CLOSED: report no benefits + a warning, never the
    // latest version's terms.
    if (!member.packageVersionId) {
      return NextResponse.json(
        {
          payer: "Medvex",
          member: { memberNumber: member.memberNumber, firstName: member.firstName, lastName: member.lastName, status: member.status, relationship: member.relationship },
          policy: { groupName: member.group.name, packageName: member.package.name },
          benefits: [],
          warning: "Member has no pinned package version; benefit balances cannot be quoted.",
        },
        { status: 200 }
      );
    }

    const packageVersion = await prisma.packageVersion.findFirst({
      where: { id: member.packageVersionId },
      include: {
        benefits: {
          select: {
            id:                true,
            category:          true,
            annualSubLimit:    true,
            perVisitLimit:     true,
            copayPercentage:   true,
            waitingPeriodDays: true,
          },
        },
      },
    });

    const now = new Date();
    const benefitConfigs = packageVersion?.benefits ?? [];
    // Project the SP-6 money base: `computeAvailability` on the pinned version is
    // the ONLY calculator that nets OVERALL cap + shared pools + expiry-reconciled
    // holds (the previous per-category `limit − used − reserved` over-reported by
    // ignoring the overall/shared constraints). amountRemaining = the minimum
    // available across every applicable constraint.
    const benefits = await Promise.all(
      benefitConfigs.map(async (bc) => {
        const limit      = Number(bc.annualSubLimit);
        const visitLimit = bc.perVisitLimit ? Number(bc.perVisitLimit) : null;
        const avail = await BenefitUsageService.computeAvailability(prisma, {
          memberId:        member.id,
          benefitCategory: bc.category,
          requestedAmount: 0,
          serviceDate:     now,
        });
        const cat       = avail?.constraints.find((c) => c.kind === "CATEGORY");
        const used      = cat?.used ?? 0;
        const reserved  = cat?.held ?? 0;
        const remaining = avail?.payableCeiling ?? Math.max(0, limit - used - reserved);
        return {
          category:        bc.category,
          annualLimit:     limit,
          perVisitLimit:   visitLimit,
          amountUsed:      used,
          amountReserved:  reserved,
          amountRemaining: remaining,
          utilizationPct:  limit > 0 ? Math.round((used / limit) * 100) : 0,
          copayPercent:    Number(bc.copayPercentage),
          waitingDays:     bc.waitingPeriodDays,
        };
      }),
    );

    return NextResponse.json(
      {
        payer: "Medvex",
        member: {
          memberNumber: member.memberNumber,
          firstName:    member.firstName,
          lastName:     member.lastName,
          status:       member.status,
          relationship: member.relationship,
        },
        policy: {
          groupName:   member.group.name,
          packageName: member.package.name,
        },
        benefits,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Benefits API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export const GET = withApiKey(getBenefits);
