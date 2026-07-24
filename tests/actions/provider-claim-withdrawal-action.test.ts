/**
 * F5.6 — provider claim-withdrawal server action.
 *
 * A thin adapter over the F5.5 canonical ClaimWithdrawalService: server-authorizes
 * (friendly early permission gate; the service self-authorizes too), delegates the
 * ctx-scoped withdrawal, revalidates on success, and signals a stale refresh when the
 * claim moved under the actor. Seam/contract test (mock deps; providerPermits is real).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rctx = vi.hoisted(() => ({
  ctx: { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: [] as string[], apiScopes: [] as string[], permissions: ["provider.claim.withdraw", "provider.claim.read"] },
}));
vi.mock("@/server/services/provider-access.service", () => ({
  ProviderAccessService: { resolveUserContext: vi.fn(async () => rctx) },
}));

class FakeWithdrawalError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "ClaimWithdrawalError"; }
}
const withdraw = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/claim-withdrawal/service", () => ({
  ClaimWithdrawalService: { withdraw },
  isClaimWithdrawalError: (e: unknown) => e instanceof FakeWithdrawalError,
}));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

import { withdrawProviderClaimAction } from "@/app/provider/claims/[id]/actions";

const okResult = { claimId: "c1", claimNumber: "CLM-1", status: "WITHDRAWN", reasonCode: "SUBMITTED_IN_ERROR", alreadyWithdrawn: false };

beforeEach(() => {
  vi.clearAllMocks();
  rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: [], apiScopes: [], permissions: ["provider.claim.withdraw", "provider.claim.read"] };
  withdraw.mockResolvedValue(okResult);
});

describe("F5.6 withdrawProviderClaimAction", () => {
  it("withdraws via the canonical service (ctx-authorized) and revalidates the detail", async () => {
    const res = await withdrawProviderClaimAction({ claimId: "c1", reasonCode: "SUBMITTED_IN_ERROR", note: "typo" });
    expect(res).toEqual({ ok: true, alreadyWithdrawn: false });
    expect(withdraw).toHaveBeenCalledWith(rctx.ctx, { tenantId: "t1", claimId: "c1", reasonCode: "SUBMITTED_IN_ERROR", note: "typo" });
    expect(revalidatePath).toHaveBeenCalledWith("/provider/claims/c1");
  });

  it("reports an idempotent replay as success (alreadyWithdrawn)", async () => {
    withdraw.mockResolvedValueOnce({ ...okResult, alreadyWithdrawn: true });
    const res = await withdrawProviderClaimAction({ claimId: "c1", reasonCode: "SUBMITTED_IN_ERROR" });
    expect(res).toEqual({ ok: true, alreadyWithdrawn: true });
  });

  it("denies a user without provider.claim.withdraw — no service call, no revalidate", async () => {
    rctx.ctx = { ...rctx.ctx, permissions: ["provider.claim.read"] };
    const res = await withdrawProviderClaimAction({ claimId: "c1", reasonCode: "SUBMITTED_IN_ERROR" });
    expect(res).toEqual({ error: expect.stringContaining("permission") });
    expect(withdraw).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a missing claim id before touching the service", async () => {
    const res = await withdrawProviderClaimAction({ claimId: "   ", reasonCode: "SUBMITTED_IN_ERROR" });
    expect(res).toEqual({ error: expect.stringContaining("Missing") });
    expect(withdraw).not.toHaveBeenCalled();
  });

  it("surfaces a stale/decided claim with a refresh signal and revalidates", async () => {
    withdraw.mockRejectedValueOnce(new FakeWithdrawalError("NOT_WITHDRAWABLE", "An approved claim cannot be withdrawn."));
    const res = await withdrawProviderClaimAction({ claimId: "c1", reasonCode: "SUBMITTED_IN_ERROR" });
    expect(res).toEqual({ error: "An approved claim cannot be withdrawn.", refresh: true });
    expect(revalidatePath).toHaveBeenCalledWith("/provider/claims/c1");
  });

  it("surfaces a fixable error (bad reason) without a refresh signal", async () => {
    withdraw.mockRejectedValueOnce(new FakeWithdrawalError("INVALID_REASON", "Unknown withdrawal reason."));
    const res = await withdrawProviderClaimAction({ claimId: "c1", reasonCode: "nope" });
    expect(res).toEqual({ error: "Unknown withdrawal reason." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
