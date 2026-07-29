/**
 * F7.6 — provider profile change-request server actions (seam/contract test).
 *
 * Thin adapters over the F7.4 service: a friendly permission gate (real
 * providerPermits), delegation with the exact args, redirect on success, and a
 * stale refresh on conflict. Deps are mocked; providerPermits is real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rctx = vi.hoisted(() => ({ ctx: { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: [] as string[], apiScopes: [] as string[], permissions: ["provider.profile.change_request"] } }));
vi.mock("@/server/services/provider-access.service", () => ({ ProviderAccessService: { resolveUserContext: vi.fn(async () => rctx) } }));

class FakeMDErr extends Error { constructor(public code: string, message: string) { super(message); this.name = "MasterDataChangeError"; } }
const submit = vi.hoisted(() => vi.fn());
const respond = vi.hoisted(() => vi.fn());
const withdraw = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/provider-master-data-change/service", () => ({
  ProviderMasterDataChangeService: { submit, respondToInformation: respond, withdraw },
  isMasterDataChangeError: (e: unknown) => e instanceof FakeMDErr,
  MASTER_DATA_CHANGE_PERMISSION: "provider.profile.change_request",
}));
const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import { submitChangeAction, respondChangeAction, withdrawChangeAction } from "@/app/provider/profile/actions";

beforeEach(() => {
  vi.clearAllMocks();
  rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", allowedProviderBranchIds: [], apiScopes: [], permissions: ["provider.profile.change_request"] };
  submit.mockResolvedValue({ id: "m1", status: "SUBMITTED", version: 1, riskLevel: "LOW" });
  respond.mockResolvedValue({ id: "m1", status: "PROVIDER_RESPONDED", version: 2 });
  withdraw.mockResolvedValue({ id: "m1", status: "WITHDRAWN", version: 2 });
});

describe("F7.6 submitChangeAction", () => {
  it("delegates the change to the service and redirects to the new request", async () => {
    await submitChangeAction({ category: "CONTACT" as never, proposed: { phone: "0700" }, idempotencyKey: "k1" });
    expect(submit).toHaveBeenCalledWith(rctx.ctx, expect.objectContaining({ category: "CONTACT", proposed: { phone: "0700" }, idempotencyKey: "k1" }));
    expect(redirect).toHaveBeenCalledWith("/provider/profile/m1");
  });
  it("a migrated user lacking the permission is refused (no service call)", async () => {
    rctx.ctx.permissions = ["provider.claim.read"]; // migrated, lacks change_request
    const res = await submitChangeAction({ category: "CONTACT" as never, proposed: { phone: "0700" }, idempotencyKey: "k1" });
    expect(res).toEqual({ error: expect.stringMatching(/permission/i) });
    expect(submit).not.toHaveBeenCalled();
  });
  it("surfaces a service error without redirecting", async () => {
    submit.mockRejectedValueOnce(new FakeMDErr("INVALID", "These fields are not allowed."));
    const res = await submitChangeAction({ category: "CONTACT" as never, proposed: { tier: "GOLD" }, idempotencyKey: "k1" });
    expect(res).toEqual({ error: "These fields are not allowed." });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("F7.6 respond/withdraw actions", () => {
  it("respond delegates with the version token", async () => {
    await respondChangeAction({ id: "m1", expectedVersion: 3, body: "confirmed" });
    expect(respond).toHaveBeenCalledWith(rctx.ctx, "m1", 3, "confirmed");
    expect(redirect).toHaveBeenCalledWith("/provider/profile/m1");
  });
  it("respond requires a body", async () => {
    const res = await respondChangeAction({ id: "m1", expectedVersion: 3, body: "  " });
    expect(res).toEqual({ error: expect.any(String) });
    expect(respond).not.toHaveBeenCalled();
  });
  it("a stale conflict signals refresh", async () => {
    withdraw.mockRejectedValueOnce(new FakeMDErr("STALE", "changed"));
    const res = await withdrawChangeAction({ id: "m1", expectedVersion: 1 });
    expect(res).toMatchObject({ error: "changed", refresh: true });
  });
});
