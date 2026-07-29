/**
 * F5.8 — provider claim-correction server action.
 *
 * A thin adapter over the F5.7 canonical ClaimReplacementService: friendly early
 * permission gate, light input validation, and — critically — it passes ONLY the
 * corrected content (the service DERIVES member/provider/branch from the predecessor,
 * so this form can never re-identify the claim). On success it redirects to the child;
 * a stale/decided predecessor returns a refresh signal. Seam test (mock deps).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rctx = vi.hoisted(() => ({
  ctx: { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: [] as string[], apiScopes: [] as string[], permissions: ["provider.claim.correct"] },
}));
vi.mock("@/server/services/provider-access.service", () => ({
  ProviderAccessService: { resolveUserContext: vi.fn(async () => rctx) },
}));

class FakeReplacementError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "ClaimReplacementError"; }
}
const replace = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/claim-replacement/service", () => ({
  ClaimReplacementService: { replace },
  isClaimReplacementError: (e: unknown) => e instanceof FakeReplacementError,
}));

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import { correctProviderClaimAction } from "@/app/provider/claims/[id]/correct/actions";

const input = {
  predecessorClaimId: "pred-1",
  idempotencyKey: "draft-1",
  reason: "fixed unit cost",
  serviceType: "OUTPATIENT" as const,
  benefitCategory: "OUTPATIENT" as const,
  dateOfService: "2026-07-20",
  primaryDiagnosis: { code: "E11.9", description: "diabetes" },
  lineItems: [{ serviceCategory: "CONSULTATION" as const, cptCode: "99213", description: "visit", quantity: 1, unitCost: 1500 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: [], apiScopes: [], permissions: ["provider.claim.correct"] };
  replace.mockResolvedValue({ predecessorClaimId: "pred-1", claimId: "child-1", claimNumber: "CLM-2", chainRootClaimId: "pred-1", replayed: false });
});

describe("F5.8 correctProviderClaimAction", () => {
  it("corrects via the canonical service and redirects to the child — passing NO identity fields", async () => {
    await correctProviderClaimAction(input);
    expect(replace).toHaveBeenCalledTimes(1);
    const [ctxArg, cmd] = replace.mock.calls[0];
    expect(ctxArg).toBe(rctx.ctx);
    expect(cmd).toMatchObject({ tenantId: "t1", predecessorClaimId: "pred-1", idempotencyKey: "draft-1", reason: "fixed unit cost" });
    // member/provider/branch are NEVER passed — the service derives them from the predecessor.
    expect(cmd).not.toHaveProperty("memberId");
    expect(cmd).not.toHaveProperty("memberNumber");
    expect(cmd).not.toHaveProperty("providerId");
    expect(cmd).not.toHaveProperty("providerBranchId");
    expect(cmd.lineItems[0]).toMatchObject({ billedAmount: 1500 }); // qty × unit recomputed server-side
    expect(redirect).toHaveBeenCalledWith("/provider/claims/child-1?corrected=1");
  });

  it("denies a user without provider.claim.correct — no service call, no redirect", async () => {
    rctx.ctx = { ...rctx.ctx, permissions: ["provider.claim.read"] };
    const res = await correctProviderClaimAction(input);
    expect(res).toEqual({ error: expect.stringContaining("permission") });
    expect(replace).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("requires a diagnosis and at least one priced line", async () => {
    expect(await correctProviderClaimAction({ ...input, primaryDiagnosis: { code: "", description: "" } })).toEqual({ error: expect.stringContaining("diagnosis") });
    expect(await correctProviderClaimAction({ ...input, lineItems: [{ serviceCategory: "CONSULTATION", cptCode: "", description: "x", quantity: 1, unitCost: 0 }] })).toEqual({ error: expect.stringContaining("service line") });
    expect(replace).not.toHaveBeenCalled();
  });

  it("surfaces a stale/decided predecessor with a refresh signal (no redirect)", async () => {
    replace.mockRejectedValueOnce(new FakeReplacementError("NOT_CORRECTABLE", "The claim was decided or replaced before this correction could be filed."));
    const res = await correctProviderClaimAction(input);
    expect(res).toEqual({ error: expect.stringContaining("decided or replaced"), refresh: true });
    expect(redirect).not.toHaveBeenCalled();
  });
});
