/**
 * F5.8 — provider claim-correction server action, on the Family Hospital UAT
 * plan P04.02 capture contract.
 *
 * Still a thin adapter over the F5.7 canonical ClaimReplacementService, and the
 * F5.8 invariant holds: the form can never re-identify the claim. Member and
 * provider are never passed to the service (it derives them from the earlier
 * claim); the case is re-resolved for the EARLIER CLAIM's member, whatever the
 * form sent; the content comes from the server's prepared capture (re-read
 * tariffs, catalogue diagnosis, carried historical lines). Stale → refresh.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rctx = vi.hoisted(() => ({
  ctx: { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: ["br-1"] as string[], apiScopes: [] as string[], permissions: ["provider.claim.correct"] },
}));
vi.mock("@/server/services/provider-access.service", () => ({
  ProviderAccessService: { resolveUserContext: vi.fn(async () => rctx) },
  isProviderAccessError: () => false,
}));

class FakeReplacementError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "ClaimReplacementError"; }
}
const replace = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/claim-replacement/service", () => ({
  ClaimReplacementService: { replace },
  isClaimReplacementError: (e: unknown) => e instanceof FakeReplacementError,
}));

const capture = vi.hoisted(() => ({ prepare: vi.fn(), predecessor: vi.fn() }));
vi.mock("@/server/services/provider-claim-capture.service", async (orig) => {
  const real = await orig<typeof import("@/server/services/provider-claim-capture.service")>();
  return { ...real, ProviderClaimCaptureService: { ...real.ProviderClaimCaptureService, prepare: capture.prepare, predecessor: capture.predecessor } };
});

const nav = vi.hoisted(() => ({ redirect: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: nav.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: nav.revalidatePath }));

import { correctProviderClaimAction } from "@/app/provider/claims/[id]/correct/actions";
import { mutationFail } from "@/lib/mutation-contract";
import type { ClaimReplacementCaptureSubmission } from "@/lib/provider-capture-contract";

const PREDECESSOR = {
  id: "pred-1", memberId: "mem-1", providerBranchId: "br-1", currency: "UGX",
  lines: [{ lineNumber: 1, serviceCategory: "CONSULTATION", description: "Consultation visit", cptCode: "99213", quantity: 1, unitCost: "1000", selectedProviderTariffId: null }],
};
const PREPARED = {
  trusted: { tenantId: "t1", providerId: "prov-1", actorId: "u1", purpose: "CLAIM_CORRECTION", memberId: "mem-1", clientId: "c", branchId: "br-1", serviceDate: new Date("2026-07-20T00:00:00Z"), serviceDateIso: "2026-07-20", benefitCategory: "OUTPATIENT", eligible: true, contractId: "con", contractVersionId: "ver", currency: "UGX", unlistedServiceRule: "REFER_FOR_REVIEW", unlistedDiscountPct: null, catalogueEnabled: true },
  serviceType: "OUTPATIENT",
  attendingDoctor: "Dr X",
  diagnosis: { code: "E11.9", description: "Type 2 diabetes mellitus, unspecified" },
  lines: [{ serviceCategory: "CONSULTATION", description: "Consultation visit", cptCode: "99213", quantity: 1, unitCost: "1500", billedAmount: "1500", selectedProviderTariffId: null, tariffRate: null, currency: "UGX", unlisted: true }],
  totalBilled: "1500",
  correlationId: "cor",
};
const input: ClaimReplacementCaptureSubmission = {
  predecessorClaimId: "pred-1",
  idempotencyKey: "op_draft-00000001",
  reason: "fixed unit cost",
  context: { purpose: "CLAIM_CORRECTION", memberRef: "mem-OTHER", branchId: "br-1", serviceDate: "2026-07-20", benefitCategory: "OUTPATIENT" },
  expectedContractVersionId: "ver",
  serviceType: "OUTPATIENT",
  diagnosisCode: "E11.9",
  lines: [{ serviceCategory: "CONSULTATION", description: "Consultation visit", quantity: "1", billedUnitPrice: "1500" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: ["br-1"], apiScopes: [], permissions: ["provider.claim.correct"] };
  capture.predecessor.mockResolvedValue(PREDECESSOR);
  capture.prepare.mockResolvedValue({ ok: true, prepared: PREPARED });
  replace.mockResolvedValue({ predecessorClaimId: "pred-1", claimId: "child-1", claimNumber: "CLM-2", chainRootClaimId: "pred-1", replayed: false });
});

describe("F5.8 correctProviderClaimAction", () => {
  it("corrects via the canonical service and redirects to the child — passing NO member or provider", async () => {
    await correctProviderClaimAction(input);
    expect(replace).toHaveBeenCalledTimes(1);
    const [ctxArg, cmd] = replace.mock.calls[0];
    expect(ctxArg).toBe(rctx.ctx);
    expect(cmd).toMatchObject({ tenantId: "t1", predecessorClaimId: "pred-1", idempotencyKey: "op_draft-00000001", reason: "fixed unit cost" });
    // member/provider are NEVER passed — the service derives them from the predecessor.
    expect(cmd).not.toHaveProperty("memberId");
    expect(cmd).not.toHaveProperty("memberNumber");
    expect(cmd).not.toHaveProperty("providerId");
    // The branch is the SERVER-resolved one, used only if the earlier claim has none.
    expect(cmd.providerBranchId).toBe("br-1");
    expect(cmd).toMatchObject({
      serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", dateOfService: "2026-07-20", currency: "UGX",
      diagnoses: [{ code: "E11.9", description: "Type 2 diabetes mellitus, unspecified", standardCharge: null, isPrimary: true }],
      lineItems: [{ serviceCategory: "CONSULTATION", cptCode: "99213", description: "Consultation visit", icdCode: "E11.9", quantity: 1, unitCost: "1500", billedAmount: "1500" }],
      lineProvenance: [{ lineNumber: 1, selectedProviderTariffId: null, tariffRate: null }],
    });
    expect(nav.redirect).toHaveBeenCalledWith("/provider/claims/child-1?corrected=1");
  });

  it("re-resolves the case for the EARLIER claim's member and carries its stored lines — not the form's member", async () => {
    await correctProviderClaimAction(input);
    expect(capture.prepare).toHaveBeenCalledWith(rctx.ctx, input, {
      purpose: "CLAIM_CORRECTION",
      fixed: { memberId: "mem-1", branchId: "br-1" },
      carried: { currency: "UGX", lines: PREDECESSOR.lines },
    });
  });

  it("denies a user without provider.claim.correct — no lookup, no service call, no redirect", async () => {
    rctx.ctx = { ...rctx.ctx, permissions: ["provider.claim.read"] };
    const res = await correctProviderClaimAction(input);
    expect(res).toMatchObject({ ok: false, kind: "FORBIDDEN" });
    expect(capture.predecessor).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("a claim this facility cannot see (or that is gone) refreshes the page", async () => {
    capture.predecessor.mockResolvedValue(null);
    expect(await correctProviderClaimAction(input)).toMatchObject({ kind: "CONFLICT", refresh: true });
    expect(replace).not.toHaveBeenCalled();
  });

  it("returns the preparation's refusal unchanged (e.g. a missing diagnosis)", async () => {
    const failure = mutationFail("VALIDATION", { fieldErrors: { diagnosis: ["Choose the primary diagnosis from the list."] } });
    capture.prepare.mockResolvedValue({ ok: false, failure });
    expect(await correctProviderClaimAction(input)).toBe(failure);
    expect(replace).not.toHaveBeenCalled();
  });

  it("surfaces a stale/decided predecessor with a refresh signal (no redirect)", async () => {
    replace.mockRejectedValueOnce(new FakeReplacementError("NOT_CORRECTABLE", "The claim was decided or replaced before this correction could be filed."));
    const res = await correctProviderClaimAction(input);
    expect(res).toMatchObject({ kind: "CONFLICT", refresh: true, message: expect.stringContaining("decided or replaced") });
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("an unexpected error is an unknown outcome — never its raw text", async () => {
    replace.mockRejectedValueOnce(new Error("Invalid `prisma.claim.update()` invocation: connection reset"));
    const res = await correctProviderClaimAction(input);
    expect(res).toMatchObject({ kind: "UNKNOWN_OUTCOME" });
    expect(JSON.stringify(res)).not.toContain("prisma");
  });

  it("rejects an HTML reason before any write", async () => {
    const res = await correctProviderClaimAction({ ...input, reason: "<script>x</script>" });
    expect(res).toMatchObject({ kind: "VALIDATION" });
    expect(replace).not.toHaveBeenCalled();
  });
});
