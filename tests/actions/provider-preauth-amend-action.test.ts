/**
 * F3.12 — provider PA amendment action.
 *
 * amendProviderPreauthAction server-authorizes (provider.preauth.create — no dedicated
 * amend permission exists), verifies the PARENT is this facility's AND APPROVED via the
 * F3.10 scoped read, then delegates to the canonical preauthAdjudicationService
 * .createPaAmendment (a linked PA-AMD) and decides it through the SAME executeAutoDecision
 * pipeline as every rail. Seam/contract test (mock deps).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rctx = vi.hoisted(() => ({ ctx: { tenantId: "t1", providerId: "prov-1", actorId: "u1", permissions: ["provider.preauth.create", "provider.preauth.read"] } }));
vi.mock("@/server/services/provider-access.service", () => ({ ProviderAccessService: { resolveUserContext: vi.fn(async () => rctx) } }));
// providerPermits is the REAL pure guard.

const getById = vi.hoisted(() => vi.fn(async () => ({ id: "pa-1", status: "APPROVED" }) as unknown));
vi.mock("@/server/services/preauth-read.service", () => ({ PreauthReadService: { getById } }));

const createPaAmendment = vi.hoisted(() => vi.fn(async () => ({ id: "amd-1", preauthNumber: "PA-AMD-2026-0001" })));
const executeAutoDecision = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/server/services/preauth-adjudication.service", () => ({ preauthAdjudicationService: { createPaAmendment, executeAutoDecision } }));
vi.mock("@/server/services/system-actor.service", () => ({ getSystemActorId: vi.fn(async () => "sys-actor") }));

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

const baseInput = {
  parentPreAuthId: "pa-1",
  additionalCost: 12000,
  additionalProcedureCode: "97110",
  additionalProcedureDescription: "Extra physiotherapy sessions",
  clinicalNotes: "Slower recovery than expected",
};

beforeEach(() => {
  vi.clearAllMocks();
  rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", permissions: ["provider.preauth.create", "provider.preauth.read"] };
  getById.mockResolvedValue({ id: "pa-1", status: "APPROVED" });
  createPaAmendment.mockResolvedValue({ id: "amd-1", preauthNumber: "PA-AMD-2026-0001" });
});

describe("F3.12 provider PA amendment", () => {
  it("creates a canonical amendment (ownership+APPROVED checked) and decides it via the pipeline", async () => {
    await expect(amendProviderPreauthAction(baseInput)).rejects.toThrow("NEXT_REDIRECT");
    expect(getById).toHaveBeenCalledWith({ tenantId: "t1", providerId: "prov-1" }, "pa-1"); // ownership scope
    expect(createPaAmendment).toHaveBeenCalledWith("pa-1", "t1", "u1", {
      additionalCost: 12000,
      additionalProcedures: [{ code: "97110", description: "Extra physiotherapy sessions" }],
      clinicalNotes: "Slower recovery than expected",
    });
    expect(executeAutoDecision).toHaveBeenCalledWith("amd-1", "t1", "sys-actor"); // same pipeline
    expect(redirectMock).toHaveBeenCalledWith("/provider/preauth/amd-1");
  });

  it("denies a user without provider.preauth.create — no read, no amendment", async () => {
    rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", permissions: ["provider.preauth.read"] };
    const res = await amendProviderPreauthAction(baseInput);
    expect(res).toEqual({ error: expect.stringContaining("permission") });
    expect(getById).not.toHaveBeenCalled();
    expect(createPaAmendment).not.toHaveBeenCalled();
  });

  it("safe not-found when the parent isn't this facility's (scoped read null)", async () => {
    getById.mockResolvedValueOnce(null);
    const res = await amendProviderPreauthAction(baseInput);
    expect(res).toEqual({ error: expect.stringContaining("not found") });
    expect(createPaAmendment).not.toHaveBeenCalled();
  });

  it("refuses to amend a non-APPROVED parent", async () => {
    getById.mockResolvedValueOnce({ id: "pa-1", status: "SUBMITTED" });
    const res = await amendProviderPreauthAction(baseInput);
    expect(res).toEqual({ error: expect.stringContaining("approved") });
    expect(createPaAmendment).not.toHaveBeenCalled();
  });

  it("validates additional cost + service before creating", async () => {
    expect(await amendProviderPreauthAction({ ...baseInput, additionalCost: 0 })).toEqual({ error: expect.stringContaining("cost") });
    expect(await amendProviderPreauthAction({ ...baseInput, additionalProcedureDescription: "  " })).toEqual({ error: expect.stringContaining("service") });
    expect(createPaAmendment).not.toHaveBeenCalled();
  });

  it("surfaces a canonical createPaAmendment error (no redirect)", async () => {
    createPaAmendment.mockRejectedValueOnce(new Error("Can only amend an APPROVED pre-authorization"));
    const res = await amendProviderPreauthAction(baseInput);
    expect(res).toEqual({ error: "Can only amend an APPROVED pre-authorization" });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("still redirects when the pipeline handoff defers (amendment durable)", async () => {
    executeAutoDecision.mockRejectedValueOnce(new Error("engine down"));
    await expect(amendProviderPreauthAction(baseInput)).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/provider/preauth/amd-1");
  });
});
