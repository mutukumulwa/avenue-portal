/**
 * F3.9 — provider PA submission action (PROVIDER_PORTAL rail).
 *
 * submitProviderPreauthAction server-authorizes (provider.preauth.create, via the
 * pure providerPermits guard), then submits through PreauthIntakeService on the
 * provider-bound PROVIDER_PORTAL channel — facility identity comes from the session
 * context, never the body (D1) — with the post-commit auto-decision wired to the
 * canonical pipeline. Seam/contract test (mock deps); the intake mechanics have
 * real-DB proof in tests/services/preauth-intake-service.test.ts (F3.3).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const cap = vi.hoisted(() => ({
  submitArgs: null as null | { ctx: Record<string, unknown>; submission: Record<string, unknown>; deps: { adjudicate: (paId: string, tid: string) => Promise<void> } },
  submitResult: null as unknown,
}));
const rctx = vi.hoisted(() => ({ ctx: { tenantId: "t1", providerId: "prov-1", actorId: "u1", permissions: ["provider.preauth.create", "provider.preauth.read"] } }));

vi.mock("@/server/services/provider-access.service", () => ({
  ProviderAccessService: { resolveUserContext: vi.fn(async () => rctx) },
}));
// providerPermits is the REAL pure guard (not mocked) — gate exercised via ctx.permissions.

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

const findUnique = vi.hoisted(() => vi.fn(async () => ({ preauthNumber: "PA-2026-0009" })));
vi.mock("@/lib/prisma", () => ({ prisma: { preAuthorization: { findUnique } } }));

vi.mock("@/server/services/preauth-intake/service", () => ({
  PreauthIntakeService: {
    submit: vi.fn(async (ctx: Record<string, unknown>, submission: Record<string, unknown>, deps: { adjudicate: (paId: string, tid: string) => Promise<void> }) => {
      cap.submitArgs = { ctx, submission, deps };
      return cap.submitResult;
    }),
  },
}));

import { submitProviderPreauthAction } from "@/app/provider/preauth/new/actions";
import { PreauthIntakeService } from "@/server/services/preauth-intake/service";

const baseInput = {
  idempotencyKey: "draft-1",
  memberNumber: "NWSC-2026-01234",
  serviceType: "OUTPATIENT" as const,
  benefitCategory: "OUTPATIENT" as const,
  expectedDateOfService: "2026-08-01",
  diagnosisCode: "B54",
  diagnosisDescription: "Malaria",
  procedureCode: "99213",
  procedureDescription: "Consult",
  estimatedCost: 8000,
  clinicalNotes: "notes",
};

beforeEach(() => {
  vi.clearAllMocks();
  rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", permissions: ["provider.preauth.create", "provider.preauth.read"] };
  cap.submitArgs = null;
  cap.submitResult = { receiptId: "r1", status: "ACCEPTED", replayed: false, preauthId: "pa-1" };
  findUnique.mockResolvedValue({ preauthNumber: "PA-2026-0009" });
});

describe("F3.9 provider PA submission → canonical PROVIDER_PORTAL intake", () => {
  it("submits on the PROVIDER_PORTAL channel with session-derived identity + mapped command", async () => {
    await expect(submitProviderPreauthAction(baseInput)).rejects.toThrow("NEXT_REDIRECT");
    expect(PreauthIntakeService.submit).toHaveBeenCalledTimes(1);
    const { ctx, submission } = cap.submitArgs!;
    expect(ctx).toEqual({ channel: "PROVIDER_PORTAL", tenantId: "t1", providerId: "prov-1", actorType: "USER", actorId: "u1" });
    // provider-bound: identity from the session, NOT the body — no providerId in the command
    expect(submission.providerId).toBeUndefined();
    expect(submission).toMatchObject({ memberNumber: "NWSC-2026-01234", serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", estimatedCost: 8000, idempotencyKey: "draft-1" });
    expect((submission.diagnoses as Array<Record<string, unknown>>)[0]).toMatchObject({ icdCode: "B54", description: "Malaria", isPrimary: true });
    expect((submission.procedures as Array<Record<string, unknown>>)[0]).toMatchObject({ cptCode: "99213", unitCost: 8000, total: 8000 });
  });

  it("wires the auto-decision to the canonical pipeline (executeAutoDecision) with a system actor", async () => {
    await expect(submitProviderPreauthAction(baseInput)).rejects.toThrow("NEXT_REDIRECT");
    await cap.submitArgs!.deps.adjudicate("pa-1", "t1");
    expect(adj.executeAutoDecision).toHaveBeenCalledWith("pa-1", "t1", "sys-actor");
  });

  it("on success redirects to the list with the PA number", async () => {
    await expect(submitProviderPreauthAction(baseInput)).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/provider/preauth?submitted=PA-2026-0009");
  });

  it("marks an idempotent replay in the redirect", async () => {
    cap.submitResult = { receiptId: "r1", status: "ACCEPTED", replayed: true, preauthId: "pa-1" };
    await expect(submitProviderPreauthAction(baseInput)).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/provider/preauth?submitted=PA-2026-0009&replayed=1");
  });

  it("denies a migrated user lacking provider.preauth.create — no submit", async () => {
    rctx.ctx = { tenantId: "t1", providerId: "prov-1", actorId: "u1", permissions: ["provider.preauth.read"] };
    const res = await submitProviderPreauthAction(baseInput);
    expect(res).toEqual({ error: expect.stringContaining("permission") });
    expect(PreauthIntakeService.submit).not.toHaveBeenCalled();
  });

  it("validates member number + estimate before submitting", async () => {
    expect(await submitProviderPreauthAction({ ...baseInput, memberNumber: "  " })).toEqual({ error: expect.stringContaining("member") });
    expect(await submitProviderPreauthAction({ ...baseInput, estimatedCost: 0 })).toEqual({ error: expect.stringContaining("estimated cost") });
    expect(PreauthIntakeService.submit).not.toHaveBeenCalled();
  });

  it("maps a REJECTED submission to a friendly error (no redirect)", async () => {
    cap.submitResult = { receiptId: "r2", status: "REJECTED", replayed: false, errors: [{ code: "MISSING_MEMBER_IDENTIFIER", message: "No eligible member found" }] };
    const res = await submitProviderPreauthAction(baseInput);
    expect(res).toEqual({ error: expect.stringContaining("NWSC-2026-01234") }); // member path names the number
    expect(redirectMock).not.toHaveBeenCalled();

    cap.submitResult = { receiptId: "r3", status: "REJECTED", replayed: false, errors: [{ code: "BENEFIT_NOT_IN_PACKAGE", message: "This benefit is not in the member's package" }] };
    expect(await submitProviderPreauthAction(baseInput)).toEqual({ error: "This benefit is not in the member's package" });
  });
});
