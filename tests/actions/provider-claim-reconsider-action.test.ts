/**
 * F5.13 — provider reconsideration submit action. A thin adapter over the F5.12
 * ClaimReconsiderationService.submit (which re-checks eligibility server-side): friendly
 * permission gate, light validation, delegation, and a stale-refresh signal. Seam test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rctx = vi.hoisted(() => ({
  ctx: { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: [] as string[], apiScopes: [] as string[], permissions: ["provider.claim.reconsider"] },
}));
vi.mock("@/server/services/provider-access.service", () => ({ ProviderAccessService: { resolveUserContext: vi.fn(async () => rctx) } }));

class FakeReconsiderationError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "ReconsiderationSubmitError"; }
}
const submit = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/claim-reconsideration/submit.service", () => ({
  ClaimReconsiderationService: { submit },
  isReconsiderationSubmitError: (e: unknown) => e instanceof FakeReconsiderationError,
}));

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import { reconsiderProviderClaimAction } from "@/app/provider/claims/[id]/reconsider/actions";

const input = {
  claimId: "c1", idempotencyKey: "draft-1", reasonCode: "INCORRECT_DECLINE",
  providerNarrative: "The decision was wrong.", requestedAmount: 300,
  lines: [{ claimLineId: "line-1", requestedAllowed: 900 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: [], apiScopes: [], permissions: ["provider.claim.reconsider"] };
  submit.mockResolvedValue({ reconsiderationId: "r1", claimId: "c1", status: "SUBMITTED", filingDeadline: new Date(), replayed: false });
});

describe("F5.13 reconsiderProviderClaimAction", () => {
  it("submits via the canonical service and redirects", async () => {
    await reconsiderProviderClaimAction(input);
    expect(submit).toHaveBeenCalledTimes(1);
    const [ctxArg, cmd] = submit.mock.calls[0];
    expect(ctxArg).toBe(rctx.ctx);
    expect(cmd).toMatchObject({ tenantId: "t1", claimId: "c1", reasonCode: "INCORRECT_DECLINE", requestedAmount: 300 });
    expect(cmd.lines[0]).toMatchObject({ claimLineId: "line-1", requestedAllowed: 900 });
    expect(redirect).toHaveBeenCalledWith("/provider/claims/c1?reconsidered=1");
  });

  it("denies a user without provider.claim.reconsider — no service call", async () => {
    rctx.ctx = { ...rctx.ctx, permissions: ["provider.claim.read"] };
    const res = await reconsiderProviderClaimAction(input);
    expect(res).toEqual({ error: expect.stringContaining("permission") });
    expect(submit).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("surfaces a stale gate (window closed) with a refresh signal", async () => {
    submit.mockRejectedValueOnce(new FakeReconsiderationError("DEADLINE_PASSED", "The window to reconsider this decision has passed."));
    const res = await reconsiderProviderClaimAction(input);
    expect(res).toEqual({ error: "The window to reconsider this decision has passed.", refresh: true });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("validates reason, amount, and lines before the service", async () => {
    expect(await reconsiderProviderClaimAction({ ...input, reasonCode: "" })).toEqual({ error: expect.stringContaining("reason") });
    expect(await reconsiderProviderClaimAction({ ...input, requestedAmount: 0 })).toEqual({ error: expect.stringContaining("greater than") });
    expect(await reconsiderProviderClaimAction({ ...input, lines: [] })).toEqual({ error: expect.stringContaining("line") });
    expect(submit).not.toHaveBeenCalled();
  });
});
