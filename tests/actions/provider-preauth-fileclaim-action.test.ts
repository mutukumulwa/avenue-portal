/**
 * F3.13 — provider "file claim from PA" action.
 *
 * fileClaimFromPreauthAction server-authorizes (provider.claim.create), verifies the PA
 * is this facility's via the F3.10 scoped read, then delegates to the canonical
 * ClaimsService.createClaimWithPreauth (prefills from the PA + submits through
 * ClaimIntakeService; idempotent; APPROVED-only) and redirects to the new claim.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rctx = vi.hoisted(() => ({ ctx: { tenantId: "t1", providerId: "prov-1", actorId: "u1", permissions: ["provider.claim.create", "provider.preauth.read"] } }));
vi.mock("@/server/services/provider-access.service", () => ({ ProviderAccessService: { resolveUserContext: vi.fn(async () => rctx) } }));
// providerPermits is the REAL pure guard.

const getById = vi.hoisted(() => vi.fn(async () => ({ id: "pa-1", status: "APPROVED" }) as unknown));
vi.mock("@/server/services/preauth-read.service", () => ({ PreauthReadService: { getById } }));

const createClaimWithPreauth = vi.hoisted(() => vi.fn(async () => ({ id: "claim-1", claimNumber: "CLM-2026-0001" })));
vi.mock("@/server/services/claims.service", () => ({ ClaimsService: { createClaimWithPreauth } }));

const writeAudit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/audit", () => ({ writeAudit }));
// module-imported but unused by this action — mocked to isolate the import graph
vi.mock("@/server/services/preauth-adjudication.service", () => ({ preauthAdjudicationService: { cancelPreAuth: vi.fn(), createPaAmendment: vi.fn(), executeAutoDecision: vi.fn() } }));
vi.mock("@/server/services/system-actor.service", () => ({ getSystemActorId: vi.fn(async () => "sys-actor") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string): never => {
    const e = new Error("NEXT_REDIRECT") as Error & { url: string };
    e.url = url;
    throw e;
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { fileClaimFromPreauthAction } from "@/app/provider/preauth/[id]/actions";

beforeEach(() => {
  vi.clearAllMocks();
  rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", permissions: ["provider.claim.create", "provider.preauth.read"] };
  getById.mockResolvedValue({ id: "pa-1", status: "APPROVED" });
  createClaimWithPreauth.mockResolvedValue({ id: "claim-1", claimNumber: "CLM-2026-0001" });
});

describe("F3.13 provider file-claim-from-PA", () => {
  it("converts an owned PA via the canonical createClaimWithPreauth and redirects to the claim", async () => {
    await expect(fileClaimFromPreauthAction({ preAuthId: "pa-1" })).rejects.toThrow("NEXT_REDIRECT");
    expect(getById).toHaveBeenCalledWith({ tenantId: "t1", providerId: "prov-1" }, "pa-1"); // ownership scope
    expect(createClaimWithPreauth).toHaveBeenCalledWith("t1", "pa-1");
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "PREAUTH_ATTACHED", metadata: { preauthId: "pa-1", claimId: "claim-1" } }));
    expect(redirectMock).toHaveBeenCalledWith("/provider/claims/claim-1");
  });

  it("denies a user without provider.claim.create — no read, no conversion", async () => {
    rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", permissions: ["provider.preauth.read"] };
    const res = await fileClaimFromPreauthAction({ preAuthId: "pa-1" });
    expect(res).toEqual({ error: expect.stringContaining("permission") });
    expect(getById).not.toHaveBeenCalled();
    expect(createClaimWithPreauth).not.toHaveBeenCalled();
  });

  it("safe not-found when the PA is not this facility's (scoped read null)", async () => {
    getById.mockResolvedValueOnce(null);
    const res = await fileClaimFromPreauthAction({ preAuthId: "pa-other" });
    expect(res).toEqual({ error: expect.stringContaining("not found") });
    expect(createClaimWithPreauth).not.toHaveBeenCalled();
  });

  it("surfaces a canonical conversion error (e.g. not approved) without redirecting", async () => {
    createClaimWithPreauth.mockRejectedValueOnce(new Error("Only approved pre-authorizations can start a claim"));
    const res = await fileClaimFromPreauthAction({ preAuthId: "pa-1" });
    expect(res).toEqual({ error: "Only approved pre-authorizations can start a claim" });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
