/**
 * F4.4 — reviewer accept/reopen/close actions (admin surface).
 *
 * Gated on the CLINICAL review role; each delegates to the canonical
 * PreauthInfoRequestService decision method, writes a compliance audit, and
 * revalidates the PA detail. Seam test (mock deps); lifecycle mechanics have
 * real-DB proof in tests/services/preauth-info-request-service.test.ts (F4.4).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireRole = vi.hoisted(() => vi.fn(async () => ({ user: { id: "reviewer-1", tenantId: "t1" } })));
vi.mock("@/lib/rbac", () => ({ requireRole, ROLES: { CLINICAL: ["CLAIMS_OFFICER", "CLINICAL", "SUPER_ADMIN"] } }));

const svc = vi.hoisted(() => ({
  accept: vi.fn(async () => ({ preAuthorizationId: "pa-1" })),
  reopen: vi.fn(async () => ({ preAuthorizationId: "pa-1" })),
  close: vi.fn(async () => ({ preAuthorizationId: "pa-1" })),
}));
vi.mock("@/server/services/preauth-info-request/service", () => ({ PreauthInfoRequestService: svc }));

const writeAudit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/audit", () => ({ writeAudit }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

import { acceptInfoRequestAction, reopenInfoRequestAction, closeInfoRequestAction } from "@/app/(admin)/preauth/[id]/info-request-actions";

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue({ user: { id: "reviewer-1", tenantId: "t1" } });
  svc.accept.mockResolvedValue({ preAuthorizationId: "pa-1" });
  svc.reopen.mockResolvedValue({ preAuthorizationId: "pa-1" });
  svc.close.mockResolvedValue({ preAuthorizationId: "pa-1" });
});

describe("F4.4 reviewer info-request decision actions", () => {
  it("accept: CLINICAL-gated, delegates + audits PREAUTH_INFO_ACCEPTED + revalidates", async () => {
    await acceptInfoRequestAction({ infoRequestId: "ir-1", note: "sufficient" });
    expect(requireRole).toHaveBeenCalledWith(["CLAIMS_OFFICER", "CLINICAL", "SUPER_ADMIN"]);
    expect(svc.accept).toHaveBeenCalledWith({ tenantId: "t1", id: "ir-1", actor: { type: "USER", id: "reviewer-1" }, note: "sufficient" });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "PREAUTH_INFO_ACCEPTED", metadata: { infoRequestId: "ir-1", preauthId: "pa-1" } }));
    expect(revalidatePath).toHaveBeenCalledWith("/preauth/pa-1");
  });

  it("reopen: delegates + audits PREAUTH_INFO_REOPENED", async () => {
    await reopenInfoRequestAction({ infoRequestId: "ir-1", note: "need more" });
    expect(svc.reopen).toHaveBeenCalledWith({ tenantId: "t1", id: "ir-1", actor: { type: "USER", id: "reviewer-1" }, note: "need more" });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "PREAUTH_INFO_REOPENED" }));
    expect(revalidatePath).toHaveBeenCalledWith("/preauth/pa-1");
  });

  it("close: delegates + audits PREAUTH_INFO_CLOSED", async () => {
    await closeInfoRequestAction({ infoRequestId: "ir-1" });
    expect(svc.close).toHaveBeenCalledWith({ tenantId: "t1", id: "ir-1", actor: { type: "USER", id: "reviewer-1" }, note: undefined });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "PREAUTH_INFO_CLOSED" }));
  });

  it("surfaces a service error without auditing or revalidating", async () => {
    svc.accept.mockRejectedValueOnce(new Error("A responded information request cannot be accepted."));
    // note: message is illustrative; the point is the error path
    const res = await acceptInfoRequestAction({ infoRequestId: "ir-1" });
    expect(res).toEqual({ error: expect.stringContaining("cannot be accepted") });
    expect(writeAudit).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("validates a missing info-request id", async () => {
    const res = await acceptInfoRequestAction({ infoRequestId: "  " });
    expect(res).toEqual({ error: expect.stringContaining("Missing") });
    expect(svc.accept).not.toHaveBeenCalled();
  });
});
