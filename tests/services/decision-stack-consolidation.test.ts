/**
 * W1.1 acceptance test 2: the duplicate decision-stack methods must stay
 * deleted. If anyone re-adds/re-exports them, this test — not a UAT six months
 * later — fails.
 */
import { describe, it, expect, vi } from "vitest";

// Minimal prisma stub so the service modules import cleanly.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { ClaimsService } from "@/server/services/claims.service";
import { claimAdjudicationService } from "@/server/services/claim-adjudication.service";
import { preauthAdjudicationService } from "@/server/services/preauth-adjudication.service";
import { ClaimDecisionService } from "@/server/services/claim-decision.service";

describe("decision-stack consolidation (W1.1)", () => {
  it("the canonical entry points exist", () => {
    expect(typeof ClaimDecisionService.decide).toBe("function");
    expect(typeof ClaimDecisionService.voidClaim).toBe("function");
    expect(typeof preauthAdjudicationService.approveByHuman).toBe("function");
    expect(typeof preauthAdjudicationService.declineByHuman).toBe("function");
  });

  it("ClaimsService no longer exposes a claim or PA decision method", () => {
    expect((ClaimsService as unknown as Record<string, unknown>).adjudicateClaim).toBeUndefined();
    expect((ClaimsService as unknown as Record<string, unknown>).adjudicatePreAuth).toBeUndefined();
    expect((ClaimsService as unknown as Record<string, unknown>).reserveBenefitUsage).toBeUndefined();
  });

  it("claimAdjudicationService no longer exposes the unguarded finalize path", () => {
    const svc = claimAdjudicationService as unknown as Record<string, unknown>;
    expect(svc.approveClaim).toBeUndefined();
    expect(svc.approveSenior).toBeUndefined();
    expect(svc.requiresSeniorApproval).toBeUndefined();
  });

  it("preauthAdjudicationService no longer exposes the legacy CONVERTED_TO_CLAIM converter", () => {
    expect((preauthAdjudicationService as unknown as Record<string, unknown>).convertHoldToClaim).toBeUndefined();
  });
});
