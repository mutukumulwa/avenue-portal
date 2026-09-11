/**
 * F5.10 — provider claim-resubmission server action, on the Family Hospital UAT
 * plan P04.02 capture contract.
 *
 * A thin adapter over the F5.10 ClaimResubmissionService (which enforces F5.9
 * eligibility and files a RESUBMISSION). It passes ONLY content from the
 * server's prepared capture — never member or provider (the service derives
 * them) — and an ineligible/stale original returns a refresh signal. Seam test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rctx = vi.hoisted(() => ({
  ctx: { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: ["br-1"] as string[], apiScopes: [] as string[], permissions: ["provider.claim.correct"] },
}));
vi.mock("@/server/services/provider-access.service", () => ({
  ProviderAccessService: { resolveUserContext: vi.fn(async () => rctx) },
  isProviderAccessError: (e: unknown) => (e as { name?: string } | null)?.name === "ProviderAccessError",
}));

class FakeResubmissionError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "ClaimResubmissionError"; }
}
const submit = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/claim-resubmission/submit.service", () => ({
  ClaimResubmissionService: { submit },
  isClaimResubmissionError: (e: unknown) => e instanceof FakeResubmissionError,
}));

const capture = vi.hoisted(() => ({ prepare: vi.fn(), predecessor: vi.fn() }));
vi.mock("@/server/services/provider-claim-capture.service", async (orig) => {
  const real = await orig<typeof import("@/server/services/provider-claim-capture.service")>();
  return { ...real, ProviderClaimCaptureService: { ...real.ProviderClaimCaptureService, prepare: capture.prepare, predecessor: capture.predecessor } };
});

const nav = vi.hoisted(() => ({ redirect: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: nav.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: nav.revalidatePath }));

import { resubmitProviderClaimAction } from "@/app/provider/claims/[id]/resubmit/actions";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import type { ClaimReplacementCaptureSubmission } from "@/lib/provider-capture-contract";

const PREDECESSOR = { id: "pred-1", memberId: "mem-1", providerBranchId: null, currency: "UGX", lines: [] };
const PREPARED = {
  trusted: { tenantId: "t1", providerId: "prov-1", actorId: "u1", purpose: "CLAIM_CORRECTION", memberId: "mem-1", clientId: "c", branchId: "br-1", serviceDate: new Date("2026-07-20T00:00:00Z"), serviceDateIso: "2026-07-20", benefitCategory: "OUTPATIENT", eligible: true, contractId: "con", contractVersionId: "ver", currency: "UGX", unlistedServiceRule: "REFER_FOR_REVIEW", unlistedDiscountPct: null, catalogueEnabled: true },
  serviceType: "OUTPATIENT",
  attendingDoctor: undefined,
  diagnosis: { code: "E11.9", description: "Type 2 diabetes mellitus, unspecified" },
  lines: [{ serviceCategory: "LABORATORY", description: "Full Blood Count", cptCode: null, quantity: 1, unitCost: "25000", billedAmount: "25000", selectedProviderTariffId: "t-fbc", tariffRate: "25000", currency: "UGX", unlisted: false }],
  totalBilled: "25000",
  correlationId: "cor",
};
const input: ClaimReplacementCaptureSubmission = {
  predecessorClaimId: "pred-1",
  idempotencyKey: "op_draft-00000001",
  reason: "attached the missing invoice",
  context: { purpose: "CLAIM_CORRECTION", memberRef: "mem-1", branchId: "br-1", serviceDate: "2026-07-20", benefitCategory: "OUTPATIENT" },
  expectedContractVersionId: "ver",
  serviceType: "OUTPATIENT",
  diagnosisCode: "E11.9",
  lines: [{ selectedProviderTariffId: "t-fbc", serviceCategory: "LABORATORY", quantity: "1", billedUnitPrice: "25000" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: ["br-1"], apiScopes: [], permissions: ["provider.claim.correct"] };
  capture.predecessor.mockResolvedValue(PREDECESSOR);
  capture.prepare.mockResolvedValue({ ok: true, prepared: PREPARED });
  submit.mockResolvedValue({ originalClaimId: "pred-1", claimId: "child-1", claimNumber: "CLM-2", chainRootClaimId: "pred-1", replayed: false });
});

describe("F5.10 resubmitProviderClaimAction", () => {
  it("resubmits via the canonical service and redirects to the child — passing NO member or provider", async () => {
    await resubmitProviderClaimAction(input);
    expect(submit).toHaveBeenCalledTimes(1);
    const [ctxArg, cmd] = submit.mock.calls[0];
    expect(ctxArg).toBe(rctx.ctx);
    expect(cmd).toMatchObject({ tenantId: "t1", predecessorClaimId: "pred-1", idempotencyKey: "op_draft-00000001", reason: "attached the missing invoice" });
    expect(cmd).not.toHaveProperty("memberId");
    expect(cmd).not.toHaveProperty("providerId");
    // A legacy original without a branch takes the branch resolved for this user.
    expect(cmd.providerBranchId).toBe("br-1");
    expect(cmd.lineProvenance).toEqual([{ lineNumber: 1, selectedProviderTariffId: "t-fbc", tariffRate: "25000" }]);
    expect(cmd.currency).toBe("UGX");
    expect(capture.prepare).toHaveBeenCalledWith(rctx.ctx, input, expect.objectContaining({ purpose: "CLAIM_CORRECTION", fixed: { memberId: "mem-1", branchId: null } }));
    expect(nav.redirect).toHaveBeenCalledWith("/provider/claims/child-1?resubmitted=1");
  });

  it("denies a user without the permission — no service call, no redirect", async () => {
    rctx.ctx = { ...rctx.ctx, permissions: ["provider.claim.read"] };
    const res = await resubmitProviderClaimAction(input);
    expect(res).toMatchObject({ ok: false, kind: "FORBIDDEN" });
    expect(submit).not.toHaveBeenCalled();
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("surfaces an ineligible/stale original with a refresh signal (no redirect)", async () => {
    submit.mockRejectedValueOnce(new FakeResubmissionError("REASON_NOT_RESUBMITTABLE", "This service is excluded under the member's cover."));
    const res = await resubmitProviderClaimAction(input);
    expect(res).toMatchObject({ kind: "CONFLICT", refresh: true, message: "This service is excluded under the member's cover." });
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("a reused draft key with different content is a conflict, without a refresh", async () => {
    submit.mockRejectedValueOnce(new FakeResubmissionError("IDEMPOTENCY_CONFLICT", "This resubmission id was already used for different content."));
    const res = await resubmitProviderClaimAction(input);
    expect(res).toMatchObject({ kind: "CONFLICT" });
    expect(res && "refresh" in res ? res.refresh : undefined).toBeUndefined();
  });

  // ── P08.01: unauthenticated, not a provider user, another facility ─────────
  it("an unauthenticated caller gets the framework's sign-in redirect — nothing is read or filed", async () => {
    vi.mocked(ProviderAccessService.resolveUserContext).mockRejectedValueOnce(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" }));
    await expect(resubmitProviderClaimAction(input)).rejects.toThrow("NEXT_REDIRECT");
    expect(capture.predecessor).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("a signed-in account that is not a provider user is refused", async () => {
    vi.mocked(ProviderAccessService.resolveUserContext).mockRejectedValueOnce(Object.assign(new Error("no"), { name: "ProviderAccessError" }));
    expect(await resubmitProviderClaimAction(input)).toMatchObject({ ok: false, kind: "FORBIDDEN" });
    expect(submit).not.toHaveBeenCalled();
  });

  it("another facility's claim is not found through the session's scope — refused with a refresh, nothing filed", async () => {
    capture.predecessor.mockResolvedValueOnce(null);
    const res = await resubmitProviderClaimAction({ ...input, predecessorClaimId: "claim-of-another-facility" });
    expect(res).toMatchObject({ ok: false, kind: "CONFLICT", refresh: true });
    expect(capture.predecessor).toHaveBeenCalledWith(rctx.ctx, "claim-of-another-facility");
    expect(capture.prepare).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});
