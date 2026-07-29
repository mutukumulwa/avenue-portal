/**
 * F3.5b — the admin PA creation rail converged on the canonical intake + pipeline.
 *
 * src/app/(admin)/preauth/new/actions.ts::submitPreAuthAction no longer calls
 * ClaimsService.createPreAuth. It now submits through PreauthIntakeService on
 * channel ADMIN_PORTAL (the SAME path the B2B and member rails use) with the
 * post-commit auto-decision wired to preauthAdjudicationService.executeAutoDecision.
 *
 * Seam/contract test (mock deps). The intake→receipt→event→handoff mechanics have
 * real-DB proof in tests/services/preauth-intake-service.test.ts (F3.3); here we
 * assert the rail's delegation contract: RBAC preserved, ADMIN_PORTAL context +
 * mapped command, auto-decision delegated to the canonical pipeline, success →
 * audit + redirect, rejection → friendly error with no audit/redirect.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const cap = vi.hoisted(() => ({
  submitArgs: null as null | { ctx: Record<string, unknown>; submission: Record<string, unknown>; deps: { adjudicate: (paId: string, tid: string) => Promise<void> } },
  submitResult: null as unknown,
}));

const requireRole = vi.hoisted(() => vi.fn(async () => ({ user: { id: "admin-1", tenantId: "t1" } })));
vi.mock("@/lib/rbac", () => ({ requireRole, ROLES: { CLINICAL: ["CLINICAL", "ADMIN", "SUPER_ADMIN"] } }));

const writeAudit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/audit", () => ({ writeAudit }));

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string): never => {
    const e = new Error("NEXT_REDIRECT") as Error & { url: string };
    e.url = url;
    throw e;
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const adj = vi.hoisted(() => ({ executeAutoDecision: vi.fn(async () => undefined) }));
vi.mock("@/server/services/preauth-adjudication.service", () => ({ preauthAdjudicationService: adj }));
vi.mock("@/server/services/system-actor.service", () => ({ getSystemActorId: vi.fn(async () => "sys-actor") }));
vi.mock("@/server/services/preauth-intake/service", () => ({
  PreauthIntakeService: {
    submit: vi.fn(async (ctx: Record<string, unknown>, submission: Record<string, unknown>, deps: { adjudicate: (paId: string, tid: string) => Promise<void> }) => {
      cap.submitArgs = { ctx, submission, deps };
      return cap.submitResult;
    }),
  },
}));

import { submitPreAuthAction } from "@/app/(admin)/preauth/new/actions";
import { PreauthIntakeService } from "@/server/services/preauth-intake/service";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}
const baseForm = {
  memberId: "member-1",
  providerId: "prov-1",
  serviceType: "OUTPATIENT",
  benefitCategory: "OUTPATIENT",
  diagnosis: "Malaria",
  estimatedCost: "8000",
  procedure: "General consultation",
  clinicalNotes: "Febrile, needs review",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue({ user: { id: "admin-1", tenantId: "t1" } });
  cap.submitArgs = null;
  cap.submitResult = { receiptId: "r1", status: "ACCEPTED", replayed: false, preauthId: "pa-1" };
});

describe("F3.5b admin PA rail → canonical pipeline", () => {
  it("gates on the CLINICAL role before doing anything", async () => {
    await expect(submitPreAuthAction(null, fd(baseForm))).rejects.toThrow("NEXT_REDIRECT");
    expect(requireRole).toHaveBeenCalledWith(["CLINICAL", "ADMIN", "SUPER_ADMIN"]);
  });

  it("submits through the canonical intake with a server-derived ADMIN_PORTAL context and mapped command", async () => {
    await expect(submitPreAuthAction(null, fd(baseForm))).rejects.toThrow("NEXT_REDIRECT");
    expect(PreauthIntakeService.submit).toHaveBeenCalledTimes(1);
    const { ctx, submission } = cap.submitArgs!;
    expect(ctx).toEqual({ channel: "ADMIN_PORTAL", tenantId: "t1", providerId: "prov-1", actorType: "USER", actorId: "admin-1" });
    expect(submission).toMatchObject({ memberId: "member-1", providerId: "prov-1", serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", estimatedCost: 8000, clinicalNotes: "Febrile, needs review" });
    expect((submission.diagnoses as Array<Record<string, unknown>>)[0]).toMatchObject({ description: "Malaria", isPrimary: true });
    expect((submission.procedures as Array<Record<string, unknown>>)[0]).toMatchObject({ description: "General consultation", unitCost: 8000, total: 8000 });
  });

  it("defaults a missing procedure description to 'Medical services'", async () => {
    const { procedure: _omit, ...noProc } = baseForm;
    await expect(submitPreAuthAction(null, fd(noProc))).rejects.toThrow("NEXT_REDIRECT");
    expect((cap.submitArgs!.submission.procedures as Array<Record<string, unknown>>)[0]).toMatchObject({ description: "Medical services" });
  });

  it("wires the auto-decision to the canonical pipeline (executeAutoDecision) with a system actor", async () => {
    await expect(submitPreAuthAction(null, fd(baseForm))).rejects.toThrow("NEXT_REDIRECT");
    await cap.submitArgs!.deps.adjudicate("pa-1", "t1");
    expect(adj.executeAutoDecision).toHaveBeenCalledWith("pa-1", "t1", "sys-actor");
  });

  it("on an accepted submission, writes the PREAUTH_SUBMITTED audit and redirects to /preauth", async () => {
    await expect(submitPreAuthAction(null, fd(baseForm))).rejects.toThrow("NEXT_REDIRECT");
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      userId: "admin-1",
      action: "PREAUTH_SUBMITTED",
      module: "PREAUTH",
      metadata: expect.objectContaining({ memberId: "member-1", preauthId: "pa-1", receiptId: "r1" }),
    }));
    expect(redirectMock).toHaveBeenCalledWith("/preauth");
  });

  it("on a REJECTED submission, returns a friendly error and does NOT audit or redirect", async () => {
    cap.submitResult = { receiptId: "r2", status: "REJECTED", replayed: false, errors: [{ code: "MISSING_SERVICE_TYPE", message: "Service type is required" }] };
    const res = await submitPreAuthAction(null, fd(baseForm));
    expect(res).toEqual({ error: "Service type is required" });
    expect(writeAudit).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("surfaces a thrown service error as a friendly error (no redirect)", async () => {
    (PreauthIntakeService.submit as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(new Error("intake exploded"));
    const res = await submitPreAuthAction(null, fd(baseForm));
    expect(res).toEqual({ error: "intake exploded" });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
