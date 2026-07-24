/**
 * F3.11 — provider PA cancellation action.
 *
 * cancelProviderPreauthAction server-authorizes (provider.preauth.cancel), verifies
 * OWNERSHIP via the F3.10 non-enumerating scoped read (a PA not at this facility ⇒
 * safe not-found), restricts to pre-use states, then delegates to the canonical
 * preauthAdjudicationService.cancelPreAuth (releases the hold + sets CANCELLED +
 * audits — not a bespoke transition). Seam/contract test (mock deps).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rctx = vi.hoisted(() => ({ ctx: { tenantId: "t1", providerId: "prov-1", actorId: "u1", permissions: ["provider.preauth.cancel", "provider.preauth.read"] } }));
vi.mock("@/server/services/provider-access.service", () => ({ ProviderAccessService: { resolveUserContext: vi.fn(async () => rctx) } }));
// providerPermits is the REAL pure guard — gate exercised via ctx.permissions.

const getById = vi.hoisted(() => vi.fn(async () => ({ id: "pa-1", status: "APPROVED" }) as unknown));
vi.mock("@/server/services/preauth-read.service", () => ({ PreauthReadService: { getById } }));

const cancelPreAuth = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/server/services/preauth-adjudication.service", () => ({ preauthAdjudicationService: { cancelPreAuth } }));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

import { cancelProviderPreauthAction } from "@/app/provider/preauth/[id]/actions";

beforeEach(() => {
  vi.clearAllMocks();
  rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", permissions: ["provider.preauth.cancel", "provider.preauth.read"] };
  getById.mockResolvedValue({ id: "pa-1", status: "APPROVED" });
});

describe("F3.11 provider PA cancellation", () => {
  it("cancels a pre-use PA via the canonical cancelPreAuth (ownership-checked, provider-scoped)", async () => {
    const res = await cancelProviderPreauthAction({ preAuthId: "pa-1", reason: "Patient no longer proceeding" });
    expect(res).toBeUndefined(); // success (no error)
    expect(getById).toHaveBeenCalledWith({ tenantId: "t1", providerId: "prov-1" }, "pa-1"); // ownership scope
    expect(cancelPreAuth).toHaveBeenCalledWith("pa-1", "t1", "u1", "Patient no longer proceeding");
    expect(revalidatePath).toHaveBeenCalledWith("/provider/preauth/pa-1");
  });

  it("defaults a blank reason", async () => {
    await cancelProviderPreauthAction({ preAuthId: "pa-1", reason: "  " });
    expect(cancelPreAuth).toHaveBeenCalledWith("pa-1", "t1", "u1", "Cancelled by provider");
  });

  it("denies a user without provider.preauth.cancel — no read, no cancel", async () => {
    rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", permissions: ["provider.preauth.read"] };
    const res = await cancelProviderPreauthAction({ preAuthId: "pa-1", reason: "x" });
    expect(res).toEqual({ error: expect.stringContaining("permission") });
    expect(getById).not.toHaveBeenCalled();
    expect(cancelPreAuth).not.toHaveBeenCalled();
  });

  it("safe not-found when the PA is not this facility's (scoped read null) — no cancel", async () => {
    getById.mockResolvedValueOnce(null);
    const res = await cancelProviderPreauthAction({ preAuthId: "pa-other", reason: "x" });
    expect(res).toEqual({ error: expect.stringContaining("not found") });
    expect(cancelPreAuth).not.toHaveBeenCalled();
  });

  it("refuses to cancel a PA already in use (ATTACHED) — no cancel", async () => {
    getById.mockResolvedValueOnce({ id: "pa-1", status: "ATTACHED" });
    const res = await cancelProviderPreauthAction({ preAuthId: "pa-1", reason: "x" });
    expect(res).toEqual({ error: expect.stringContaining("ATTACHED") });
    expect(cancelPreAuth).not.toHaveBeenCalled();
  });

  it("surfaces a canonical-cancel error (e.g. terminal state) without redirecting", async () => {
    cancelPreAuth.mockRejectedValueOnce(new Error("A utilised pre-authorization cannot be cancelled."));
    const res = await cancelProviderPreauthAction({ preAuthId: "pa-1", reason: "x" });
    expect(res).toEqual({ error: "A utilised pre-authorization cannot be cancelled." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
