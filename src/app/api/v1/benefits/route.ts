import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey } from "@/lib/apiAuth";

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

    const member = await prisma.member.findFirst({
      where: { memberNumber },
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
      select: { benefitConfigId: true, amountUsed: true },
    });

    const usageMap = new Map<string, number>(
      usages.map((u) => [u.benefitConfigId, Number(u.amountUsed)])
    );

    const benefitConfigs = packageVersion?.benefits ?? [];
    const benefits = benefitConfigs.map((bc) => {
      const limit       = Number(bc.annualSubLimit);
      const visitLimit  = bc.perVisitLimit ? Number(bc.perVisitLimit) : null;
      const used        = usageMap.get(bc.id) ?? 0;
      const remaining   = Math.max(0, limit - used);
      return {
        category:        bc.category,
        annualLimit:     limit,
        perVisitLimit:   visitLimit,
        amountUsed:      used,
        amountRemaining: remaining,
        utilizationPct:  limit > 0 ? Math.round((used / limit) * 100) : 0,
        copayPercent:    Number(bc.copayPercentage),
        waitingDays:     bc.waitingPeriodDays,
      };
    });

    return NextResponse.json(
      {
        payer: "Avenue Healthcare",
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
