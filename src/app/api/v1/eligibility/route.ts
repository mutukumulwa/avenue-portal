import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey, getApiCredential, operatorTenantWhere, providerScopeError } from "@/lib/apiAuth";
import { ROUTE_SCOPE_CATALOG } from "@/lib/provider-api-scopes";
import { ProviderEntitlementService } from "@/server/services/provider-entitlement.service";
import { ProvidersService } from "@/server/services/providers.service";
import { decideEligibility } from "@/server/services/eligibility/evaluator-core";
import { parseValidDate } from "@/lib/dates";
import { rateLimit } from "@/lib/rate-limit";

async function getEligibility(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const memberNumber = searchParams.get("memberNumber");

    if (!memberNumber) {
      return NextResponse.json({ error: "Missing memberNumber parameter" }, { status: 400 });
    }

    // E2E-D02: a per-facility key may only resolve members of the clients its
    // contracts cover; a member outside that entitlement returns 404. The
    // operator key is confined to its bound tenant (BD-06 / operatorTenantWhere).
    const credential = await getApiCredential(req);
    // F1.7: this route group requires the eligibility read scope. Unscoped legacy
    // keys pass; a scoped key must carry api.eligibility.read (operator exempt).
    const scopeErr = providerScopeError(credential, ROUTE_SCOPE_CATALOG.eligibility);
    if (scopeErr) return scopeErr;

    // ELIG-GAP-015: dampen per-credential enumeration/amplification of the
    // expensive entitlement + bcrypt path (429 + Retry-After beyond the threshold).
    const limiterKey = credential?.kind === "provider" ? `elig:${credential.keyId}` : "elig:operator";
    const limited = rateLimit(limiterKey, 60, 60_000);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "Too many eligibility checks — slow down and retry." },
        { status: 429, headers: { "retry-after": String(limited.retryAfterSeconds) } },
      );
    }

    // WP-N4 (N-014): a suspended/non-operational facility's key returns neither
    // eligibility nor member PII (before any member lookup). Operator keys carry
    // no single provider, so this gate applies only to per-facility credentials.
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
      include: {
        group: { select: { name: true, status: true, tenantId: true, effectiveDate: true, renewalDate: true, client: { select: { status: true } } } },
        package: { select: { name: true } },
      }
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // SP-6: eligibility is the single evaluator's verdict — not a bare
    // status===ACTIVE check. It honours the policy window, the member's pinned
    // version, group/client status, coverage-as-of-service-date and enrolment.
    // ELIG-GAP-007: a malformed serviceDate must be a controlled 400, never an
    // Invalid Date reaching the evaluator's date arithmetic.
    const serviceParam = searchParams.get("serviceDate");
    const serviceDate = serviceParam ? parseValidDate(serviceParam) : new Date();
    if (serviceDate === null) {
      return NextResponse.json({ error: "Invalid serviceDate — use YYYY-MM-DD" }, { status: 400 });
    }
    const coveragePeriods = await prisma.memberCoveragePeriod.findMany({
      where: { memberId: member.id },
      select: { startDate: true, endDate: true },
    });
    const decision = decideEligibility({
      serviceDate,
      memberExists: true,
      member: {
        status: member.status,
        relationship: member.relationship,
        dateOfBirth: member.dateOfBirth,
        enrollmentDate: member.enrollmentDate,
        coverEndDate: member.coverEndDate,
        packageVersionId: member.packageVersionId,
      },
      client: member.group.client ? { status: member.group.client.status } : undefined,
      group: { status: member.group.status, effectiveDate: member.group.effectiveDate, renewalDate: member.group.renewalDate },
      coveragePeriods,
    });
    const isEligible = decision.conclusion === "ELIGIBLE";

    // Slade360 SMART interface shape
    const responseSchema = {
      payer: "Medvex",
      member: {
        firstName: member.firstName,
        lastName: member.lastName,
        memberNumber: member.memberNumber,
        dob: member.dateOfBirth.toISOString().split("T")[0],
        gender: member.gender,
        relationship: member.relationship,
      },
      policy: {
        groupName: member.group.name,
        packageName: member.package.name,
        status: member.status,
        isEligible,
        reason: decision.reasonCode,
        asOfServiceDate: serviceDate.toISOString().split("T")[0],
      }
    };

    return NextResponse.json(responseSchema, { status: 200 });

  } catch (error) {
    console.error("Eligibility API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export const GET = withApiKey(getEligibility);
