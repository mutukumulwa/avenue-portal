/**
 * F5.7 / Family Hospital UAT plan P04.02 — the replacement envelope builder.
 * Member and provider always come from the earlier claim; a replacement never
 * changes an existing branch, and only a branchless (legacy) earlier claim
 * takes the branch the provider capture resolved. The case currency rides along.
 */
import { describe, it, expect } from "vitest";
import { buildReplacementSubmission, type ReplaceClaimCommand } from "@/server/services/claim-replacement/submission";

const command = (over: Partial<ReplaceClaimCommand> = {}): ReplaceClaimCommand => ({
  tenantId: "t1",
  predecessorClaimId: "pred-1",
  idempotencyKey: "op_draft-0001",
  serviceType: "OUTPATIENT",
  benefitCategory: "OUTPATIENT",
  dateOfService: "2026-09-10",
  diagnoses: [{ code: "B54", description: "Malaria, unspecified", standardCharge: null, isPrimary: true }],
  lineItems: [{ serviceCategory: "LABORATORY", cptCode: "", description: "Full Blood Count", icdCode: "B54", quantity: 1, unitCost: "25000", billedAmount: "25000" }],
  ...over,
});
const predecessor = (providerBranchId: string | null) => ({ memberId: "mem-1", providerId: "prov-1", providerBranchId, claimNumber: "CLM-1" });

describe("buildReplacementSubmission", () => {
  it("keeps the earlier claim's branch whatever the command carries", () => {
    const s = buildReplacementSubmission(predecessor("br-original"), command({ providerBranchId: "br-other" }));
    expect(s.provider).toEqual({ providerId: "prov-1", branchId: "br-original" });
    expect(s.member).toEqual({ memberId: "mem-1" });
  });

  it("a branchless earlier claim takes the resolved branch", () => {
    expect(buildReplacementSubmission(predecessor(null), command({ providerBranchId: "br-resolved" })).provider).toEqual({ providerId: "prov-1", branchId: "br-resolved" });
    expect(buildReplacementSubmission(predecessor(null), command()).provider).toEqual({ providerId: "prov-1" });
  });

  it("carries the case currency and decimal-text money", () => {
    const s = buildReplacementSubmission(predecessor("br-1"), command({ currency: "UGX" }));
    expect(s.currency).toBe("UGX");
    expect(s.lines[0]).toMatchObject({ unitCost: "25000", billedAmount: "25000" });
    expect(s.replacementOfClaimRef).toBe("CLM-1");
  });
});
