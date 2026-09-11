/**
 * F3.12 — provider PA amendment action, on the Family Hospital UAT plan P04.03
 * capture contract.
 *
 * Kept: server authorization (provider.preauth.create — no dedicated amend
 * permission exists); the PARENT must be this facility's AND APPROVED via the
 * F3.10 scoped read; the canonical preauthAdjudicationService.createPaAmendment
 * (a linked PA-AMD) decided through the SAME executeAutoDecision pipeline.
 * New: the additional services are prepared for the PARENT's member, date and
 * benefit (fixed by the server, not the form), stored in the intake's procedure
 * shape with provenance, and the additional cost is decimal text.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

const rctx = vi.hoisted(() => ({ ctx: { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: ["br-1"], permissions: ["provider.preauth.create", "provider.preauth.read"] } }));
vi.mock("@/server/services/provider-access.service", () => ({ ProviderAccessService: { resolveUserContext: vi.fn(async () => rctx) }, isProviderAccessError: () => false }));

const PARENT = { id: "pa-1", status: "APPROVED", memberId: "mem-1", benefitCategory: "SURGICAL", expectedDateOfService: new Date("2026-09-20T00:00:00Z") };
const getById = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/preauth-read.service", () => ({ PreauthReadService: { getById } }));

const createPaAmendment = vi.hoisted(() => vi.fn(async () => ({ id: "amd-1", preauthNumber: "PA-AMD-2026-0001" })));
const executeAutoDecision = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/server/services/preauth-adjudication.service", () => ({ preauthAdjudicationService: { createPaAmendment, executeAutoDecision } }));
vi.mock("@/server/services/system-actor.service", () => ({ getSystemActorId: vi.fn(async () => "sys-actor") }));

const capture = vi.hoisted(() => ({ prepareLines: vi.fn() }));
vi.mock("@/server/services/provider-claim-capture.service", async (orig) => {
  const real = await orig<typeof import("@/server/services/provider-claim-capture.service")>();
  return { ...real, ProviderClaimCaptureService: { ...real.ProviderClaimCaptureService, prepareLines: capture.prepareLines } };
});

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string): never => {
    const e = new Error("NEXT_REDIRECT") as Error & { url: string };
    e.url = url;
    throw e;
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { amendProviderPreauthAction } from "@/app/provider/preauth/[id]/actions";
import { mutationFail } from "@/lib/mutation-contract";
import type { PreauthAmendmentCaptureSubmission } from "@/lib/provider-capture-contract";

const PREPARED = {
  trusted: { memberId: "mem-1", branchId: "br-1", currency: "UGX" },
  lines: [{ serviceCategory: "OTHER", description: "Physiotherapy Session", cptCode: null, quantity: 3, unitCost: "40000", billedAmount: "120000", selectedProviderTariffId: "t-physio", tariffRate: "35000", currency: "UGX", unlisted: false }],
  totalBilled: "120000",
  correlationId: "cor",
};
const INPUT: PreauthAmendmentCaptureSubmission = {
  parentPreAuthId: "pa-1",
  context: { purpose: "PREAUTH", memberRef: "mem-OTHER", branchId: "br-1", serviceDate: "2030-01-01", benefitCategory: "OUTPATIENT" },
  expectedContractVersionId: "ver",
  lines: [{ selectedProviderTariffId: "t-physio", serviceCategory: "OTHER", quantity: "3", billedUnitPrice: "40000" }],
  clinicalNotes: "Slower recovery than expected",
};

beforeEach(() => {
  vi.clearAllMocks();
  rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: ["br-1"], permissions: ["provider.preauth.create", "provider.preauth.read"] };
  getById.mockResolvedValue(PARENT);
  createPaAmendment.mockResolvedValue({ id: "amd-1", preauthNumber: "PA-AMD-2026-0001" });
  capture.prepareLines.mockResolvedValue({ ok: true, prepared: PREPARED });
});

describe("F3.12 provider PA amendment (P04.03)", () => {
  it("creates a canonical amendment in the intake's procedure shape and decides it via the pipeline", async () => {
    await expect(amendProviderPreauthAction(INPUT)).rejects.toThrow("NEXT_REDIRECT");
    expect(getById).toHaveBeenCalledWith({ tenantId: "t1", providerId: "prov-1" }, "pa-1"); // ownership scope
    expect(createPaAmendment).toHaveBeenCalledWith("pa-1", "t1", "u1", {
      additionalCost: "120000",
      additionalProcedures: [
        { cptCode: null, description: "Physiotherapy Session", quantity: 3, unitCost: "40000.00", total: "120000.00", selectedProviderTariffId: "t-physio", contractedUnitRate: "35000", currency: "UGX" },
      ],
      clinicalNotes: "Slower recovery than expected",
    });
    expect(executeAutoDecision).toHaveBeenCalledWith("amd-1", "t1", "sys-actor"); // same pipeline
    expect(redirectMock).toHaveBeenCalledWith("/provider/preauth/amd-1");
  });

  it("prices the additional services for the PARENT's member, date and benefit — not the form's", async () => {
    await expect(amendProviderPreauthAction(INPUT)).rejects.toThrow("NEXT_REDIRECT");
    expect(capture.prepareLines).toHaveBeenCalledWith(rctx.ctx, INPUT, {
      purpose: "PREAUTH",
      fixed: { memberId: "mem-1", branchId: null, serviceDate: "2026-09-20", benefitCategory: "SURGICAL" },
    });
  });

  it("denies a user without provider.preauth.create — no read, no amendment", async () => {
    rctx.ctx = { ...rctx.ctx, permissions: ["provider.preauth.read"] };
    const res = await amendProviderPreauthAction(INPUT);
    expect(res).toMatchObject({ ok: false, kind: "FORBIDDEN" });
    expect(getById).not.toHaveBeenCalled();
    expect(createPaAmendment).not.toHaveBeenCalled();
  });

  it("safe not-found when the parent isn't this facility's (scoped read null)", async () => {
    getById.mockResolvedValueOnce(null);
    const res = await amendProviderPreauthAction(INPUT);
    expect(res).toMatchObject({ kind: "VALIDATION", message: expect.stringContaining("not found") });
    expect(createPaAmendment).not.toHaveBeenCalled();
  });

  it("refuses to amend a non-APPROVED parent", async () => {
    getById.mockResolvedValueOnce({ ...PARENT, status: "SUBMITTED" });
    const res = await amendProviderPreauthAction(INPUT);
    expect(res).toMatchObject({ kind: "CONFLICT", message: expect.stringContaining("approved") });
    expect(createPaAmendment).not.toHaveBeenCalled();
  });

  it("returns the lines' refusal before creating anything", async () => {
    const failure = mutationFail("VALIDATION", { fieldErrors: { "lines.0.service": ["This service is no longer on your price list for this date. Select the service again."] } });
    capture.prepareLines.mockResolvedValue({ ok: false, failure });
    expect(await amendProviderPreauthAction(INPUT)).toBe(failure);
    expect(createPaAmendment).not.toHaveBeenCalled();
  });

  it("a canonical refusal is a conflict; anything else an unknown outcome (no redirect)", async () => {
    createPaAmendment.mockRejectedValueOnce(new TRPCError({ code: "BAD_REQUEST", message: "Can only amend an APPROVED pre-authorization" }));
    expect(await amendProviderPreauthAction(INPUT)).toMatchObject({ kind: "CONFLICT", message: "Can only amend an APPROVED pre-authorization" });
    createPaAmendment.mockRejectedValueOnce(new Error("socket hang up"));
    const res = await amendProviderPreauthAction(INPUT);
    expect(res).toMatchObject({ kind: "UNKNOWN_OUTCOME" });
    expect(JSON.stringify(res)).not.toContain("socket");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("still redirects when the pipeline handoff defers (amendment durable)", async () => {
    executeAutoDecision.mockRejectedValueOnce(new Error("engine down"));
    await expect(amendProviderPreauthAction(INPUT)).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/provider/preauth/amd-1");
  });
});
