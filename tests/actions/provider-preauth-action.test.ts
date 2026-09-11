/**
 * F3.9 — provider PA submission action (PROVIDER_PORTAL rail), on the Family
 * Hospital UAT plan P04.03 capture contract.
 *
 * Kept: server authorization (provider.preauth.create, the real providerPermits
 * guard); the canonical PreauthIntakeService on the provider-bound
 * PROVIDER_PORTAL channel — facility identity from the session, never the body
 * (D1); the post-commit auto-decision wired to the canonical pipeline.
 * New: the member is the one the SERVER resolved (by id, not a typed number);
 * procedures and the estimate are decimal text from the prepared lines; the
 * capture provenance travels as a trusted argument, never in the payload; a
 * refused request returns field errors and a reused draft key is a conflict.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const cap = vi.hoisted(() => ({
  submitArgs: null as null | { ctx: Record<string, unknown>; submission: Record<string, unknown>; deps: { adjudicate: (paId: string, tid: string) => Promise<void> }; trusted: unknown },
  submitResult: null as unknown,
  submitError: null as unknown,
}));
const rctx = vi.hoisted(() => ({ ctx: { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: ["br-1"], permissions: ["provider.preauth.create", "provider.preauth.read"] } }));

vi.mock("@/server/services/provider-access.service", () => ({
  ProviderAccessService: { resolveUserContext: vi.fn(async () => rctx) },
  isProviderAccessError: (e: unknown) => (e as { name?: string } | null)?.name === "ProviderAccessError",
}));

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string): never => {
    const e = new Error("NEXT_REDIRECT") as Error & { url: string };
    e.url = url;
    throw e;
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const adj = vi.hoisted(() => ({ executeAutoDecision: vi.fn(async () => undefined) }));
vi.mock("@/server/services/preauth-adjudication.service", () => ({ preauthAdjudicationService: adj }));
vi.mock("@/server/services/system-actor.service", () => ({ getSystemActorId: vi.fn(async () => "sys-actor") }));

const findUnique = vi.hoisted(() => vi.fn(async () => ({ preauthNumber: "PA-2026-0009" })));
vi.mock("@/lib/prisma", () => ({ prisma: { preAuthorization: { findUnique } } }));

vi.mock("@/server/services/preauth-intake/service", () => {
  class PreauthIntakeConflict extends Error {
    constructor(public receiptId: string) { super("Idempotency key reused with a different request"); }
  }
  return {
    PreauthIntakeConflict,
    PreauthIntakeService: {
      submit: vi.fn(async (ctx: Record<string, unknown>, submission: Record<string, unknown>, deps: { adjudicate: (paId: string, tid: string) => Promise<void> }, _db: unknown, trusted: unknown) => {
        cap.submitArgs = { ctx, submission, deps, trusted };
        if (cap.submitError) throw cap.submitError;
        return cap.submitResult;
      }),
    },
  };
});

const capture = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock("@/server/services/provider-claim-capture.service", async (orig) => {
  const real = await orig<typeof import("@/server/services/provider-claim-capture.service")>();
  return { ...real, ProviderClaimCaptureService: { ...real.ProviderClaimCaptureService, prepare: capture.prepare } };
});

import { submitProviderPreauthAction } from "@/app/provider/preauth/new/actions";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { PreauthIntakeService, PreauthIntakeConflict } from "@/server/services/preauth-intake/service";
import { mutationFail } from "@/lib/mutation-contract";
import type { PreauthCaptureSubmission } from "@/lib/provider-capture-contract";

const PREPARED = {
  trusted: { tenantId: "t1", providerId: "prov-1", actorId: "u1", purpose: "PREAUTH", memberId: "mem-1", clientId: "c", branchId: "br-1", serviceDate: new Date("2026-09-20T00:00:00Z"), serviceDateIso: "2026-09-20", benefitCategory: "SURGICAL", eligible: true, contractId: "con", contractVersionId: "ver", currency: "UGX", unlistedServiceRule: "REFER_FOR_REVIEW", unlistedDiscountPct: null, catalogueEnabled: true },
  serviceType: "DAY_CASE",
  attendingDoctor: undefined,
  diagnosis: { code: "L72.0", description: "Epidermal cyst" },
  lines: [{ serviceCategory: "PROCEDURE", description: "Excision of lesion (less than 5 lesions)", cptCode: null, quantity: 1, unitCost: "600000", billedAmount: "600000", selectedProviderTariffId: "t-exc", tariffRate: "270000", currency: "UGX", unlisted: false }],
  totalBilled: "600000",
  correlationId: "cor",
};
const INPUT: PreauthCaptureSubmission = {
  idempotencyKey: "op_draft-00000001",
  context: { purpose: "PREAUTH", memberRef: "mem-1", branchId: "br-1", serviceDate: "2026-09-20", benefitCategory: "SURGICAL" },
  expectedContractVersionId: "ver",
  serviceType: "DAY_CASE",
  diagnosisCode: "L72.0",
  // "600,000" as typed: the form sends canonical decimal text; the server parses again.
  lines: [{ selectedProviderTariffId: "t-exc", serviceCategory: "PROCEDURE", quantity: "1", billedUnitPrice: "600000" }],
  clinicalNotes: "Recurrent, painful",
};

beforeEach(() => {
  vi.clearAllMocks();
  rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: ["br-1"], permissions: ["provider.preauth.create", "provider.preauth.read"] };
  cap.submitArgs = null;
  cap.submitError = null;
  cap.submitResult = { receiptId: "r1", status: "ACCEPTED", replayed: false, preauthId: "pa-1" };
  findUnique.mockResolvedValue({ preauthNumber: "PA-2026-0009" });
  capture.prepare.mockResolvedValue({ ok: true, prepared: PREPARED });
});

describe("F3.9 provider PA submission → canonical PROVIDER_PORTAL intake (P04.03)", () => {
  it("submits on the PROVIDER_PORTAL channel with session identity and the SERVER's case", async () => {
    await expect(submitProviderPreauthAction(INPUT)).rejects.toThrow("NEXT_REDIRECT");
    expect(capture.prepare).toHaveBeenCalledWith(rctx.ctx, INPUT, { purpose: "PREAUTH" });
    expect(PreauthIntakeService.submit).toHaveBeenCalledTimes(1);
    const { ctx, submission, trusted } = cap.submitArgs!;
    expect(ctx).toEqual({ channel: "PROVIDER_PORTAL", tenantId: "t1", providerId: "prov-1", providerBranchId: "br-1", actorType: "USER", actorId: "u1" });
    // provider-bound: identity from the session, NOT the body
    expect(submission.providerId).toBeUndefined();
    expect(submission.memberNumber).toBeUndefined();
    expect(submission).toMatchObject({
      memberId: "mem-1", serviceType: "DAY_CASE", benefitCategory: "SURGICAL", expectedDateOfService: "2026-09-20",
      estimatedCost: "600000", idempotencyKey: "op_draft-00000001", clinicalNotes: "Recurrent, painful",
    });
    expect(submission.diagnoses).toEqual([{ icdCode: "L72.0", description: "Epidermal cyst", isPrimary: true }]);
    // The estimate as billed, the contracted rate NOT in the untrusted payload…
    expect(submission.procedures).toEqual([{ description: "Excision of lesion (less than 5 lesions)", quantity: 1, unitCost: "600000", total: "600000" }]);
    // …but as trusted provenance.
    expect(trusted).toEqual({ procedureProvenance: [{ selectedProviderTariffId: "t-exc", contractedUnitRate: "270000", currency: "UGX" }] });
  });

  it("wires the auto-decision to the canonical pipeline (executeAutoDecision) with a system actor", async () => {
    await expect(submitProviderPreauthAction(INPUT)).rejects.toThrow("NEXT_REDIRECT");
    await cap.submitArgs!.deps.adjudicate("pa-1", "t1");
    expect(adj.executeAutoDecision).toHaveBeenCalledWith("pa-1", "t1", "sys-actor");
  });

  it("on success redirects to the list with the PA number, marking a replay", async () => {
    await expect(submitProviderPreauthAction(INPUT)).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenLastCalledWith("/provider/preauth?submitted=PA-2026-0009");
    cap.submitResult = { receiptId: "r1", status: "ACCEPTED", replayed: true, preauthId: "pa-1" };
    await expect(submitProviderPreauthAction(INPUT)).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenLastCalledWith("/provider/preauth?submitted=PA-2026-0009&replayed=1");
  });

  it("denies a user lacking provider.preauth.create — nothing prepared or submitted", async () => {
    rctx.ctx = { ...rctx.ctx, permissions: ["provider.preauth.read"] };
    const res = await submitProviderPreauthAction(INPUT);
    expect(res).toMatchObject({ ok: false, kind: "FORBIDDEN" });
    expect(capture.prepare).not.toHaveBeenCalled();
    expect(PreauthIntakeService.submit).not.toHaveBeenCalled();
  });

  it("returns the preparation's refusal (e.g. an estimate that is not an amount) — nothing submitted", async () => {
    const failure = mutationFail("VALIDATION", { fieldErrors: { "lines.0.billedUnitPrice": ["Enter an amount such as 600,000."] } });
    capture.prepare.mockResolvedValue({ ok: false, failure });
    expect(await submitProviderPreauthAction(INPUT)).toBe(failure);
    expect(PreauthIntakeService.submit).not.toHaveBeenCalled();
  });

  it("maps a REJECTED submission onto the form's fields (no redirect)", async () => {
    cap.submitResult = { receiptId: "r2", status: "REJECTED", replayed: false, errors: [{ code: "MISSING_MEMBER_IDENTIFIER", message: "Member is not active" }] };
    expect(await submitProviderPreauthAction(INPUT)).toMatchObject({ kind: "VALIDATION", fieldErrors: { member: ["Member is not active"] } });
    cap.submitResult = { receiptId: "r3", status: "REJECTED", replayed: false, errors: [{ code: "BENEFIT_NOT_IN_PACKAGE", field: "benefitCategory", message: "This benefit is not in the member's package" }] };
    expect(await submitProviderPreauthAction(INPUT)).toMatchObject({ kind: "VALIDATION", fieldErrors: { benefitCategory: ["This benefit is not in the member's package"] } });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("a draft key reused with new content is a conflict — not an uncaught error", async () => {
    cap.submitError = new PreauthIntakeConflict("r-old");
    expect(await submitProviderPreauthAction(INPUT)).toMatchObject({ kind: "CONFLICT" });
  });

  it("any other failure is an unknown outcome, never its raw text", async () => {
    cap.submitError = new Error("connect ECONNREFUSED 10.0.0.1:5432");
    const res = await submitProviderPreauthAction(INPUT);
    expect(res).toMatchObject({ kind: "UNKNOWN_OUTCOME" });
    expect(JSON.stringify(res)).not.toContain("ECONNREFUSED");
  });

  // ── P08.01: unauthenticated, not a provider user, another facility ─────────
  it("an unauthenticated caller gets the framework's sign-in redirect — nothing prepared or submitted", async () => {
    vi.mocked(ProviderAccessService.resolveUserContext).mockRejectedValueOnce(Object.assign(new Error("NEXT_REDIRECT_SIGNIN"), { digest: "NEXT_REDIRECT;replace;/login;307;" }));
    await expect(submitProviderPreauthAction(INPUT)).rejects.toThrow("NEXT_REDIRECT_SIGNIN");
    expect(capture.prepare).not.toHaveBeenCalled();
    expect(PreauthIntakeService.submit).not.toHaveBeenCalled();
  });

  it("a signed-in account that is not a provider user is refused", async () => {
    vi.mocked(ProviderAccessService.resolveUserContext).mockRejectedValueOnce(Object.assign(new Error("no"), { name: "ProviderAccessError" }));
    expect(await submitProviderPreauthAction(INPUT)).toMatchObject({ ok: false, kind: "FORBIDDEN" });
    expect(PreauthIntakeService.submit).not.toHaveBeenCalled();
  });

  it("scope is the session's: a body naming another facility changes nothing, and a foreign branch is refused", async () => {
    const spoofed = { ...INPUT, providerId: "prov-OTHER", tenantId: "t-OTHER", context: { ...INPUT.context, branchId: "br-OTHER" } } as unknown as PreauthCaptureSubmission;
    capture.prepare.mockResolvedValueOnce({ ok: false, failure: mutationFail("VALIDATION", { fieldErrors: { branch: ["Choose one of your own branches."] } }) });
    expect(await submitProviderPreauthAction(spoofed)).toMatchObject({ kind: "VALIDATION" });
    expect(capture.prepare.mock.calls[0][0]).toBe(rctx.ctx);
    expect(PreauthIntakeService.submit).not.toHaveBeenCalled();

    await expect(submitProviderPreauthAction(spoofed)).rejects.toThrow("NEXT_REDIRECT");
    expect(cap.submitArgs!.ctx).toMatchObject({ tenantId: "t1", providerId: "prov-1", providerBranchId: "br-1" });
    expect(cap.submitArgs!.submission.providerId).toBeUndefined();
  });
});
