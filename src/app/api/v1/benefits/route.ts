import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey, getApiCredential, operatorTenantWhere, providerScopeError } from "@/lib/apiAuth";
import { ROUTE_SCOPE_CATALOG } from "@/lib/provider-api-scopes";
import { rateLimit } from "@/lib/rate-limit";
import { ProviderEntitlementService } from "@/server/services/provider-entitlement.service";
import { ProvidersService } from "@/server/services/providers.service";
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
    // ELIG-GAP-009 (Phase 6): enforce the benefits read scope (this route
    // previously never checked it). Fail-closed: an unscoped key is denied.
    const scopeErr = providerScopeError(credential, ROUTE_SCOPE_CATALOG.benefits);
    if (scopeErr) return scopeErr;

    // ELIG-GAP-015: per-credential rate limit (shared threshold with eligibility so
    // it cannot be bypassed by alternating the two member-reading endpoints).
    const limiterKey = credential?.kind === "provider" ? `elig:${credential.keyId}` : "elig:operator";
    const limited = rateLimit(limiterKey, 60, 60_000);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "Too many benefit lookups — slow down and retry." },
        { status: 429, headers: { "retry-after": String(limited.retryAfterSeconds) } },
      );
    }

    // WP-N4 (N-014): a suspended/non-operational facility's key returns neither
    // benefit balances nor member PII (before any member lookup). Operator keys
    // carry no single provider, so this gate applies only to provider credentials.
    if (credential?.kind === "provider") {
      const facility = await prisma.provider.findFirst({
        where: { id: credential.providerId, tenantId: credential.tenantId },
        select: { contractStatus: true },
      });
      if (!facility || !ProvidersService.isOperational(facility.contractStatus)) {
        return NextResponse.json({ error: "Facility is not currently active" }, { status: 403 });
      }
    }

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
