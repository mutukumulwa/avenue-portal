/**
 * F4.3 — provider info-response action (submitInfoResponseAction).
 *
 * Gated on provider.preauth.respond; ownership is enforced by passing ctx.providerId
 * to the service (a request not this facility's is a non-enumerating NOT_FOUND).
 * Seam/contract test (mock deps); the lifecycle mechanics have real-DB proof in
 * tests/services/preauth-info-request-service.test.ts (F4.3).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rctx = vi.hoisted(() => ({ ctx: { tenantId: "t1", providerId: "prov-1", actorId: "u1", permissions: ["provider.preauth.respond", "provider.preauth.read"] } }));
vi.mock("@/server/services/provider-access.service", () => ({ ProviderAccessService: { resolveUserContext: vi.fn(async () => rctx) } }));
// providerPermits is the REAL pure guard.

const submitResponse = vi.hoisted(() => vi.fn(async () => ({ preAuthorizationId: "pa-9" })));
vi.mock("@/server/services/preauth-info-request/service", () => ({ PreauthInfoRequestService: { submitResponse } }));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
const writeAudit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/audit", () => ({ writeAudit }));

import { submitInfoResponseAction } from "@/app/provider/preauth/[id]/info-request-actions";

beforeEach(() => {
  vi.clearAllMocks();
  rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", permissions: ["provider.preauth.respond", "provider.preauth.read"] };
  submitResponse.mockResolvedValue({ preAuthorizationId: "pa-9" });
});

describe("F4.3 submitInfoResponseAction", () => {
  it("submits the response with the facility scope + revalidates the PA detail", async () => {
    const res = await submitInfoResponseAction({ infoRequestId: "ir-1", responseNote: "Labs attached." });
    expect(res).toBeUndefined();
    expect(submitResponse).toHaveBeenCalledWith({
      tenantId: "t1", id: "ir-1", providerId: "prov-1", responseNote: "Labs attached.", actor: { type: "USER", id: "u1" },
    });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "PREAUTH_INFO_RESPONSE_SUBMITTED", metadata: { infoRequestId: "ir-1", preauthId: "pa-9" } }));
    expect(revalidatePath).toHaveBeenCalledWith("/provider/preauth/pa-9");
  });

  it("denies a user without provider.preauth.respond — no submit", async () => {
    rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", permissions: ["provider.preauth.read"] };
    const res = await submitInfoResponseAction({ infoRequestId: "ir-1", responseNote: "x" });
    expect(res).toEqual({ error: expect.stringContaining("permission") });
    expect(submitResponse).not.toHaveBeenCalled();
  });

  it("validates a non-empty response before submitting", async () => {
    const res = await submitInfoResponseAction({ infoRequestId: "ir-1", responseNote: "   " });
    expect(res).toEqual({ error: expect.stringContaining("response") });
    expect(submitResponse).not.toHaveBeenCalled();
  });

  it("surfaces a service error (e.g. NOT_FOUND / NOT_RESPONDABLE) without revalidating", async () => {
    submitResponse.mockRejectedValueOnce(new Error("Information request not found."));
    const res = await submitInfoResponseAction({ infoRequestId: "ir-x", responseNote: "x" });
    expect(res).toEqual({ error: "Information request not found." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
