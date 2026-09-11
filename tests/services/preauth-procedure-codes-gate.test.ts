/**
 * Family Hospital UAT plan P04.03 / DEC-FH-X4 — the auto-decision's code-based
 * gates read the procedure code in BOTH stored shapes. The canonical intake
 * stores `cptCode`; the old amendment writer stored `code`. Before this, the
 * gates read only `code`, so an intake-created PA's procedure codes were never
 * screened (the never-auto list and procedure exclusions could not fire).
 * Reading the code can only make a decision more careful, never approve more.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";

const db = vi.hoisted(() => ({
  preAuthorization: { findUnique: vi.fn() },
  member: { findUnique: vi.fn(async () => ({ packageVersionId: null })), findFirst: vi.fn(async () => null) },
  membershipExclusion: { findMany: vi.fn(async () => []) },
  waitingPeriodApplication: { findMany: vi.fn(async () => []) },
  claim: { findMany: vi.fn(async () => []) },
  claimFraudAlert: { findMany: vi.fn(async () => []) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/benefit-usage.service", () => ({ BenefitUsageService: { availableLimit: vi.fn(async () => null) } }));
// Past gate 7 the network gate needs an entitlement; none here, so the run stops
// there — after the procedure gate has recorded its verdict.
vi.mock("@/server/services/provider-entitlement.service", () => ({ ProviderEntitlementService: { entitledMemberWhere: vi.fn(async () => ({ id: "__none__" })) } }));

import { preauthAdjudicationService } from "@/server/services/preauth-adjudication.service";

const pa = (procedures: unknown) => ({
  id: "pa-1", tenantId: "t1", memberId: "m1", providerId: "p1", estimatedCost: new Prisma.Decimal("20000"), expectedDateOfService: null,
  benefitCategory: "SURGICAL", isEmergency: false, diagnoses: [{ code: "M17.1", description: "Primary osteoarthritis, knee", isPrimary: true }],
  procedures,
  member: { status: "ACTIVE", coverEndDate: null, benefitUsages: [] },
  provider: { id: "p1", name: "Family Healthcare", contractStatus: "ACTIVE", tier: "TIER_2" },
});

beforeEach(() => vi.clearAllMocks());

describe("runAutoDecision — procedure codes in either stored shape", () => {
  it.each([
    ["intake shape (cptCode)", [{ cptCode: "27447", description: "Total knee arthroplasty", quantity: 1, unitCost: "20000.00", total: "20000.00" }]],
    ["old amendment shape (code)", [{ code: "27447", description: "Total knee arthroplasty" }]],
  ])("%s: a never-auto procedure routes to a human", async (_label, procedures) => {
    db.preAuthorization.findUnique.mockResolvedValue(pa(procedures));
    const r = await preauthAdjudicationService.runAutoDecision("pa-1", "t1");
    expect(r.decision).toBe("ROUTE_TO_HUMAN");
    expect(r.gateLog.at(-1)).toMatchObject({ gate: "PROCEDURE_NEVER_AUTO", outcome: "ROUTE_TO_HUMAN" });
  });

  it("a PA whose lines carry no code (Family's price list) is not held up by the code gates", async () => {
    db.preAuthorization.findUnique.mockResolvedValue(pa([{ cptCode: null, description: "Excision of lesion", quantity: 1, unitCost: "20000.00", total: "20000.00" }]));
    const r = await preauthAdjudicationService.runAutoDecision("pa-1", "t1");
    expect(r.gateLog.find((g) => g.gate === "PROCEDURE_NEVER_AUTO")).toMatchObject({ outcome: "PASS" });
  });
});
