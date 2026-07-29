/**
 * F7.6 — TPA operator change-review server actions (seam/contract test).
 *
 * requireRole(ADMIN_ONLY)-gated thin adapters over the F7.4/F7.5 service. Proves
 * the reviewer/bank actors are built from the session (bank verify/activate carry
 * the operator's capability set), the delegation args, and the error mapping.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const session = vi.hoisted(() => ({ user: { id: "op-1", tenantId: "t1", role: "SUPER_ADMIN", permissions: ["provider.bank_change.verify", "provider.bank_change.activate"] } }));
const requireRole = vi.hoisted(() => vi.fn(async () => session));
vi.mock("@/lib/rbac", () => ({ requireRole, ROLES: { ADMIN_ONLY: ["SUPER_ADMIN"] } }));

class FakeMDErr extends Error { constructor(public code: string, message: string) { super(message); this.name = "MasterDataChangeError"; } }
const startReview = vi.hoisted(() => vi.fn());
const approve = vi.hoisted(() => vi.fn());
const reject = vi.hoisted(() => vi.fn());
const verifyBankChange = vi.hoisted(() => vi.fn());
const activateBankChange = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/provider-master-data-change/service", () => ({
  ProviderMasterDataChangeService: { startReview, approve, reject, requestInformation: vi.fn(), verifyBankChange, activateBankChange },
  isMasterDataChangeError: (e: unknown) => e instanceof FakeMDErr,
}));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

import { startReviewAction, approveAction, rejectAction, verifyBankAction, activateBankAction } from "@/app/(admin)/provider-changes/actions";

beforeEach(() => {
  vi.clearAllMocks();
  session.user.permissions = ["provider.bank_change.verify", "provider.bank_change.activate"];
  for (const m of [startReview, approve, reject, verifyBankChange, activateBankChange]) m.mockResolvedValue({ id: "m1", status: "APPROVED", version: 2, riskLevel: "LOW" });
});

describe("F7.6 review actions", () => {
  it("startReview builds the reviewer from the session, delegates, and revalidates", async () => {
    const res = await startReviewAction({ id: "m1", expectedVersion: 1 });
    expect(res).toEqual({ ok: true });
    expect(startReview).toHaveBeenCalledWith({ userId: "op-1", tenantId: "t1", role: "SUPER_ADMIN" }, "m1", 1);
    expect(revalidatePath).toHaveBeenCalledWith("/provider-changes/m1");
  });
  it("reject requires an explanation", async () => {
    const res = await rejectAction({ id: "m1", expectedVersion: 1, explanation: "  " });
    expect(res).toEqual({ error: expect.any(String) });
    expect(reject).not.toHaveBeenCalled();
  });
  it("approve delegates (maker/checker resolved server-side)", async () => {
    await approveAction({ id: "m1", expectedVersion: 1 });
    expect(approve).toHaveBeenCalledWith({ userId: "op-1", tenantId: "t1", role: "SUPER_ADMIN" }, "m1", 1, expect.any(Object));
  });
  it("verifyBank passes the operator capability set + the verification facts", async () => {
    await verifyBankAction({ id: "m1", expectedVersion: 1, method: "PHONE_CALLBACK", reference: "CALL-9" });
    expect(verifyBankChange).toHaveBeenCalledWith({ userId: "op-1", tenantId: "t1", permissions: ["provider.bank_change.verify", "provider.bank_change.activate"] }, "m1", 1, { method: "PHONE_CALLBACK", reference: "CALL-9" });
  });
  it("activateBank delegates with the operator actor", async () => {
    await activateBankAction({ id: "m1", expectedVersion: 1 });
    expect(activateBankChange).toHaveBeenCalledWith({ userId: "op-1", tenantId: "t1", permissions: expect.arrayContaining(["provider.bank_change.activate"]) }, "m1", 1);
  });
  it("a stale conflict signals refresh", async () => {
    approve.mockRejectedValueOnce(new FakeMDErr("STALE", "changed"));
    const res = await approveAction({ id: "m1", expectedVersion: 1 });
    expect(res).toMatchObject({ error: "changed", refresh: true });
  });
});
