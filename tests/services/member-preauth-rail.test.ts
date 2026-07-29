/**
 * F3.5 — the member PA rail converged on the canonical pipeline.
 *
 * MemberPreAuthService.request no longer creates a PA directly and no longer runs
 * its own bespoke auto-approve (the old 15,000 ceiling + CPT allowlist +
 * benefit-exhaustion decline are DELETED). It now:
 *   - preserves member authorization (self or an ACTIVE dependant only) and the
 *     friendly provider-active / benefit-exists pre-checks;
 *   - submits through PreauthIntakeService on channel MEMBER_APP with a
 *     server-derived caller context and the mapped canonical command;
 *   - wires the post-commit auto-decision to the SAME pipeline the B2B rail uses
 *     (preauthAdjudicationService.executeAutoDecision) — never its own approve/decline;
 *   - reflects the persisted PA status back to the member (status → decision +
 *     notification) and surfaces a rejected submission as a friendly error.
 *
 * This is a seam/contract test (mock deps). The intake → receipt → SUBMITTED
 * event → adjudicate-handoff MECHANICS (incl. the deferral case) are proven
 * against a REAL DB in tests/services/preauth-intake-service.test.ts (F3.3); the
 * rail now calls that exact proven path, so here we assert only the rail's
 * delegation contract deterministically.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const cap = vi.hoisted(() => ({
  submitArgs: null as null | { ctx: Record<string, unknown>; submission: Record<string, unknown>; deps: { adjudicate: (paId: string, tid: string) => Promise<void> } },
  submitResult: null as unknown,
  paStatus: "SUBMITTED" as string,
}));
const ctxState = vi.hoisted(() => ({
  member: null as null | { id: string; dependents: Array<{ id: string; status: string }> },
}));
const dbState = vi.hoisted(() => ({
  provider: { contractStatus: "ACTIVE", name: "Nairobi West Hospital" } as { contractStatus: string; name: string } | null,
  tariff: null as null | { agreedRate: number },
  memberBenefits: [{ id: "b1", category: "OUTPATIENT", annualSubLimit: 500_000 }] as Array<{ id: string; category: string; annualSubLimit: number }>,
}));
const notif = vi.hoisted(() => ({ create: vi.fn(async () => undefined) }));
const adj = vi.hoisted(() => ({ executeAutoDecision: vi.fn(async () => undefined), approveByHuman: vi.fn(async () => undefined), declineByHuman: vi.fn(async () => undefined) }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    member: { findUnique: vi.fn(async () => ({ package: { currentVersion: { benefits: dbState.memberBenefits } } })) },
    provider: { findUnique: vi.fn(async () => dbState.provider) },
    providerTariff: { findFirst: vi.fn(async () => dbState.tariff) },
    preAuthorization: { findUnique: vi.fn(async () => ({ status: cap.paStatus })) },
  },
}));
vi.mock("@/server/services/member-app.service", () => ({ MemberAppService: { resolveMemberContext: vi.fn(async () => ctxState.member) } }));
vi.mock("@/server/services/member-notification.service", () => ({ MemberNotificationService: { create: notif.create } }));
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
// NOTE: ProvidersService is intentionally NOT mocked — getMemberProcedureCatalog()
// is a pure static catalog and we want the REAL "99213" resolution.

import { MemberPreAuthService } from "@/server/services/member-preauth.service";
import { PreauthIntakeService } from "@/server/services/preauth-intake/service";

const USER = "user-1";
const TENANT = "tenant-1";
const PROVIDER = "prov-1";
const baseInput = { providerId: PROVIDER, procedureCode: "99213", diagnosis: "Malaria" };

beforeEach(() => {
  vi.clearAllMocks();
  ctxState.member = { id: "m-self", dependents: [{ id: "m-dep", status: "ACTIVE" }, { id: "m-dep-x", status: "SUSPENDED" }] };
  dbState.provider = { contractStatus: "ACTIVE", name: "Nairobi West Hospital" };
  dbState.tariff = null;
  dbState.memberBenefits = [{ id: "b1", category: "OUTPATIENT", annualSubLimit: 500_000 }];
  cap.submitArgs = null;
  cap.submitResult = { receiptId: "r1", status: "ACCEPTED", replayed: false, preauthId: "pa-1" };
  cap.paStatus = "SUBMITTED";
});

describe("F3.5 member PA rail → canonical pipeline", () => {
  it("blocks a request for someone who is not self or an active dependant, without submitting", async () => {
    await expect(MemberPreAuthService.request(USER, TENANT, { ...baseInput, memberId: "m-stranger" }))
      .rejects.toThrow(/yourself or an active dependant/);
    expect(PreauthIntakeService.submit).not.toHaveBeenCalled();
  });

  it("treats a suspended dependant as not allowed", async () => {
    await expect(MemberPreAuthService.request(USER, TENANT, { ...baseInput, memberId: "m-dep-x" }))
      .rejects.toThrow(/active dependant/);
    expect(PreauthIntakeService.submit).not.toHaveBeenCalled();
  });

  it("rejects when no member profile is linked to the account", async () => {
    ctxState.member = null;
    await expect(MemberPreAuthService.request(USER, TENANT, baseInput)).rejects.toThrow(/No member profile/);
    expect(PreauthIntakeService.submit).not.toHaveBeenCalled();
  });

  it("still rejects an inactive provider before submitting (preserved UX guard)", async () => {
    dbState.provider = { contractStatus: "SUSPENDED", name: "X" };
    await expect(MemberPreAuthService.request(USER, TENANT, baseInput)).rejects.toThrow(/active Medvex or partner facility/);
    expect(PreauthIntakeService.submit).not.toHaveBeenCalled();
  });

  it("still rejects when the package shows no cover for the category (preserved UX guard)", async () => {
    dbState.memberBenefits = [{ id: "b2", category: "DENTAL", annualSubLimit: 100_000 }];
    await expect(MemberPreAuthService.request(USER, TENANT, baseInput)).rejects.toThrow(/does not currently show/);
    expect(PreauthIntakeService.submit).not.toHaveBeenCalled();
  });

  it("allows an active dependant and submits under that member id", async () => {
    await MemberPreAuthService.request(USER, TENANT, { ...baseInput, memberId: "m-dep" });
    expect(cap.submitArgs?.submission.memberId).toBe("m-dep");
  });

  it("submits through the canonical intake with a server-derived MEMBER_APP context and mapped command", async () => {
    await MemberPreAuthService.request(USER, TENANT, baseInput);
    expect(PreauthIntakeService.submit).toHaveBeenCalledTimes(1);
    const { ctx, submission } = cap.submitArgs!;
    // context is derived from the trusted session, never the body
    expect(ctx).toEqual({ channel: "MEMBER_APP", tenantId: TENANT, providerId: PROVIDER, actorType: "USER", actorId: USER });
    expect(submission).toMatchObject({ memberId: "m-self", providerId: PROVIDER, benefitCategory: "OUTPATIENT", estimatedCost: 2800 });
    expect((submission.diagnoses as Array<Record<string, unknown>>)[0]).toMatchObject({ description: "Malaria", isPrimary: true });
    expect((submission.procedures as Array<Record<string, unknown>>)[0]).toMatchObject({ cptCode: "99213", quantity: 1, unitCost: 2800, total: 2800 });
  });

  it("wires the auto-decision to the canonical pipeline (executeAutoDecision) — the removed 15k approve/decline never runs", async () => {
    await MemberPreAuthService.request(USER, TENANT, baseInput);
    // the rail delegates the decision; it must not run its own approve/decline anymore
    expect(adj.approveByHuman).not.toHaveBeenCalled();
    expect(adj.declineByHuman).not.toHaveBeenCalled();
    // the injected handoff runs the SAME pipeline the B2B rail uses, with a system actor
    await cap.submitArgs!.deps.adjudicate("pa-1", TENANT);
    expect(adj.executeAutoDecision).toHaveBeenCalledWith("pa-1", TENANT, "sys-actor");
  });

  it("no longer applies a 15k ceiling — a 40,000 estimate still routes to the canonical pipeline", async () => {
    dbState.tariff = { agreedRate: 40_000 };
    await MemberPreAuthService.request(USER, TENANT, baseInput);
    expect(cap.submitArgs?.submission.estimatedCost).toBe(40_000);
    expect(PreauthIntakeService.submit).toHaveBeenCalledTimes(1);
    expect(adj.approveByHuman).not.toHaveBeenCalled();
  });

  it("reflects an APPROVED pipeline decision as AUTO_APPROVED with a HIGH notification", async () => {
    cap.paStatus = "APPROVED";
    const res = await MemberPreAuthService.request(USER, TENANT, baseInput);
    expect(res.decision).toBe("AUTO_APPROVED");
    expect(notif.create).toHaveBeenCalledWith(expect.objectContaining({ priority: "HIGH", memberId: "m-self", metadata: { preauthId: "pa-1", decision: "AUTO_APPROVED" } }));
  });

  it("reflects a DECLINED pipeline decision as AUTO_DECLINED with a HIGH notification", async () => {
    cap.paStatus = "DECLINED";
    const res = await MemberPreAuthService.request(USER, TENANT, baseInput);
    expect(res.decision).toBe("AUTO_DECLINED");
    expect(notif.create).toHaveBeenCalledWith(expect.objectContaining({ priority: "HIGH", metadata: { preauthId: "pa-1", decision: "AUTO_DECLINED" } }));
  });

  it("reflects a still-open status as PENDING_HUMAN_REVIEW with a NORMAL notification", async () => {
    cap.paStatus = "UNDER_REVIEW";
    const res = await MemberPreAuthService.request(USER, TENANT, baseInput);
    expect(res.decision).toBe("PENDING_HUMAN_REVIEW");
    expect(notif.create).toHaveBeenCalledWith(expect.objectContaining({ priority: "NORMAL", metadata: { preauthId: "pa-1", decision: "PENDING_HUMAN_REVIEW" } }));
  });

  it("surfaces a REJECTED submission as a friendly error and sends no notification", async () => {
    cap.submitResult = { receiptId: "r2", status: "REJECTED", replayed: false, errors: [{ code: "MEMBER_NOT_ACTIVE", message: "Member is not active" }] };
    await expect(MemberPreAuthService.request(USER, TENANT, baseInput)).rejects.toThrow("Member is not active");
    expect(notif.create).not.toHaveBeenCalled();
  });
});
