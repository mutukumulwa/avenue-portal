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
        id:           true,
        memberNumber: true,
        firstName:    true,
        lastName:     true,
        status:       true,
        relationship: true,
        packageId:    true,
        group:        { select: { name: true, status: true } },
        package:      { select: { name: true } },
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

    // Fetch the latest PackageVersion for the member's package
    const packageVersion = await prisma.packageVersion.findFirst({
      where: { packageId: member.packageId },
      orderBy: { versionNumber: "desc" },
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

    // Fetch current-period benefit usages for this member
    const now = new Date();
    const usages = await prisma.benefitUsage.findMany({
      where: {
        memberId:    member.id,
        periodStart: { lte: now },
        periodEnd:   { gte: now },
      },
      select: { benefitConfigId: true, amountUsed: true, activeHoldAmount: true },
    });

    const usageMap = new Map(usages.map((u) => [u.benefitConfigId, u]));
    // P1.5: a facility must see what is truly uncommitted — approved-PA holds
    // reduce the remaining balance (expiry-reconciled, FG-C10) and are surfaced
    // separately as amountReserved.
    const holdSums = await BenefitUsageService.liveHoldSums(prisma, [member.id]);

    const benefitConfigs = packageVersion?.benefits ?? [];
    const benefits = benefitConfigs.map((bc) => {
      const limit       = Number(bc.annualSubLimit);
      const visitLimit  = bc.perVisitLimit ? Number(bc.perVisitLimit) : null;
      const row         = usageMap.get(bc.id);
      const used        = Number(row?.amountUsed ?? 0);
      const reserved    = BenefitUsageService.reconcileStored(
        Number(row?.activeHoldAmount ?? 0),
        holdSums.get(BenefitUsageService.holdKey(member.id, String(bc.category))),
      );
      const remaining   = Math.max(0, limit - used - reserved);
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
    });

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
