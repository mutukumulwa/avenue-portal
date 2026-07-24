/**
 * F5.10 — provider claim-resubmission server action.
 *
 * A thin adapter over the F5.10 ClaimResubmissionService (which enforces F5.9 eligibility
 * and files a RESUBMISSION): friendly permission gate, light validation, and — critically —
 * it passes ONLY the content (the service derives member/provider/branch). On success it
 * redirects to the child; an ineligible/stale original returns a refresh signal. Seam test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rctx = vi.hoisted(() => ({
  ctx: { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: [] as string[], apiScopes: [] as string[], permissions: ["provider.claim.correct"] },
}));
vi.mock("@/server/services/provider-access.service", () => ({
  ProviderAccessService: { resolveUserContext: vi.fn(async () => rctx) },
}));

class FakeResubmissionError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "ClaimResubmissionError"; }
}
const submit = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/claim-resubmission/submit.service", () => ({
  ClaimResubmissionService: { submit },
  isClaimResubmissionError: (e: unknown) => e instanceof FakeResubmissionError,
}));

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import { resubmitProviderClaimAction } from "@/app/provider/claims/[id]/resubmit/actions";

const input = {
  predecessorClaimId: "pred-1",
  idempotencyKey: "draft-1",
  reason: "attached the missing invoice",
  serviceType: "OUTPATIENT" as const,
  benefitCategory: "OUTPATIENT" as const,
  dateOfService: "2026-07-20",
  primaryDiagnosis: { code: "E11.9", description: "diabetes" },
  lineItems: [{ serviceCategory: "CONSULTATION" as const, cptCode: "99213", description: "visit", quantity: 1, unitCost: 2000 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: [], apiScopes: [], permissions: ["provider.claim.correct"] };
  submit.mockResolvedValue({ originalClaimId: "pred-1", claimId: "child-1", claimNumber: "CLM-2", chainRootClaimId: "pred-1", replayed: false });
});

describe("F5.10 resubmitProviderClaimAction", () => {
  it("resubmits via the canonical service and redirects to the child — passing NO identity fields", async () => {
    await resubmitProviderClaimAction(input);
    expect(submit).toHaveBeenCalledTimes(1);
    const [ctxArg, cmd] = submit.mock.calls[0];
    expect(ctxArg).toBe(rctx.ctx);
    expect(cmd).toMatchObject({ tenantId: "t1", predecessorClaimId: "pred-1", idempotencyKey: "draft-1", reason: "attached the missing invoice" });
    expect(cmd).not.toHaveProperty("memberId");
    expect(cmd).not.toHaveProperty("providerId");
    expect(cmd).not.toHaveProperty("providerBranchId");
    expect(cmd.lineItems[0]).toMatchObject({ billedAmount: 2000 });
    expect(redirect).toHaveBeenCalledWith("/provider/claims/child-1?resubmitted=1");
  });

  it("denies a user without the permission — no service call, no redirect", async () => {
    rctx.ctx = { ...rctx.ctx, permissions: ["provider.claim.read"] };
    const res = await resubmitProviderClaimAction(input);
    expect(res).toEqual({ error: expect.stringContaining("permission") });
    expect(submit).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("surfaces an ineligible/stale original with a refresh signal (no redirect)", async () => {
    submit.mockRejectedValueOnce(new FakeResubmissionError("REASON_NOT_RESUBMITTABLE", "This service is excluded under the member's cover."));
    const res = await resubmitProviderClaimAction(input);
    expect(res).toEqual({ error: "This service is excluded under the member's cover.", refresh: true });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("requires a diagnosis and at least one priced line", async () => {
    expect(await resubmitProviderClaimAction({ ...input, primaryDiagnosis: { code: "", description: "" } })).toEqual({ error: expect.stringContaining("diagnosis") });
    expect(await resubmitProviderClaimAction({ ...input, lineItems: [{ serviceCategory: "CONSULTATION", cptCode: "", description: "x", quantity: 1, unitCost: 0 }] })).toEqual({ error: expect.stringContaining("service line") });
    expect(submit).not.toHaveBeenCalled();
  });
});
