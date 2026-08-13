/**
 * P07.06 forged-request acceptance: the three action endpoints must re-read the
 * member status before any business write. The profile's disabled links are not
 * an authorization or integrity boundary.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.hoisted(() =>
  vi.fn(async () => ({ user: { id: "operator-1", tenantId: "t1" } })),
);
vi.mock("@/lib/rbac", () => ({
  requireRole,
  ROLES: {
    CLAIMS_OPS: ["CLAIMS_OPS"],
    CLINICAL: ["CLINICAL"],
    MEMBER_OPS: ["MEMBER_OPS"],
  },
}));

const evaluate = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/member-action-guard.service", () => ({
  MemberActionGuardService: { evaluate },
  memberActionRefusal: (verdict: { reason: string; nextAction: string }) =>
    [verdict.reason, verdict.nextAction].filter(Boolean).join(" "),
}));

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string): never => {
    const error = new Error("NEXT_REDIRECT") as Error & { url: string };
    error.url = url;
    throw error;
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const runClaimIntake = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/claim-intake", () => ({ runClaimIntake }));
const reimbursementSubmit = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/reimbursement.service", () => ({
  reimbursementService: { submit: reimbursementSubmit },
}));

const preauthSubmit = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/preauth-intake/service", () => ({
  PreauthIntakeService: { submit: preauthSubmit },
}));
vi.mock("@/server/services/preauth-adjudication.service", () => ({
  preauthAdjudicationService: { executeAutoDecision: vi.fn() },
}));
vi.mock("@/server/services/system-actor.service", () => ({ getSystemActorId: vi.fn() }));
const writeAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit", () => ({ writeAudit }));

const groupFindFirst = vi.hoisted(() => vi.fn());
const endorsementCreate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({
  prisma: {
    group: { findFirst: groupFindFirst },
    endorsement: { create: endorsementCreate, findFirst: vi.fn() },
  },
}));
const peekNextDocumentNumber = vi.hoisted(() => vi.fn());
// P08.04: endorsement creation moved from `peek + create` to the retrying
// allocator. The stub calls through with a fixed number so these tests still
// assert the ACTION's behaviour; the allocator itself is covered by
// tests/lib/document-number.test.ts.
const createWithDocumentNumber = vi.hoisted(() =>
  vi.fn(
    async (
      _prefix: string,
      _findLatest: (yp: string) => Promise<string | null>,
      create: (n: string) => Promise<unknown>,
    ) => create("END-2026-00042"),
  ),
);
vi.mock("@/lib/document-number", () => ({ createWithDocumentNumber }));

import {
  submitClaimAction,
  submitReimbursementClaimAction,
} from "@/app/(admin)/claims/new/actions";
import { submitPreAuthAction } from "@/app/(admin)/preauth/new/actions";
import { submitEndorsementAction } from "@/app/(admin)/endorsements/new/actions";

const denied = {
  allowed: false,
  reason: "New Claim is not available while this membership is lapsed.",
  nextAction: "Reinstate within the catch-up window.",
};
const allowed = { allowed: true, reason: "", nextAction: "" };

const claimInput = {
  idempotencyKey: "draft-1",
  memberId: "m1",
  providerId: "p1",
  serviceType: "OUTPATIENT" as const,
  benefitCategory: "OUTPATIENT" as const,
  dateOfService: "2026-08-12",
  diagnoses: [],
  lineItems: [],
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  evaluate.mockResolvedValue(allowed);
  runClaimIntake.mockResolvedValue({ ok: true, claimId: "c1", replayed: false });
  reimbursementSubmit.mockResolvedValue({ claimId: "c2" });
  preauthSubmit.mockResolvedValue({
    receiptId: "r1",
    status: "ACCEPTED",
    replayed: false,
    preauthId: "pa1",
  });
  groupFindFirst.mockResolvedValue({ renewalDate: new Date("2027-01-01"), contributionRate: 365 });
  endorsementCreate.mockResolvedValue({ id: "e1" });
  peekNextDocumentNumber.mockResolvedValue("END-2026-00001");
});

describe("P07.06 claims reject an inactive forged member id", () => {
  it("blocks direct claim intake before a receipt or claim is created", async () => {
    evaluate.mockResolvedValue(denied);
    const result = await submitClaimAction(claimInput);
    expect(result).toEqual({
      ok: false,
      error: `${denied.reason} ${denied.nextAction}`,
    });
    expect(evaluate).toHaveBeenCalledWith({ tenantId: "t1", memberId: "m1", action: "CLAIM" });
    expect(runClaimIntake).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("blocks reimbursement before proof/payment processing", async () => {
    evaluate.mockResolvedValue(denied);
    const result = await submitReimbursementClaimAction({
      ...claimInput,
      lineItems: [],
      reimbursementMpesaPhone: "+256772555042",
    });
    expect(result?.ok).toBe(false);
    expect(reimbursementSubmit).not.toHaveBeenCalled();
  });
});

describe("P07.06 pre-authorization rejects an inactive forged member id", () => {
  it("returns the policy reason before canonical intake", async () => {
    evaluate.mockResolvedValue({ ...denied, reason: denied.reason.replace("Claim", "Pre-Auth") });
    const result = await submitPreAuthAction(
      null,
      form({
        memberId: "m1",
        providerId: "p1",
        benefitCategory: "OUTPATIENT",
        serviceType: "OUTPATIENT",
        diagnosis: "Malaria",
        estimatedCost: "8000",
      }),
    );
    expect(result.error).toMatch(/lapsed/i);
    expect(evaluate).toHaveBeenCalledWith({ tenantId: "t1", memberId: "m1", action: "PREAUTH" });
    expect(preauthSubmit).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });
});

describe("P07.06 endorsements reject inactive or out-of-group targets", () => {
  it("returns the policy reason before numbering, calculation or creation", async () => {
    evaluate.mockResolvedValue({ ...denied, reason: denied.reason.replace("Claim", "Endorsement") });
    const result = await submitEndorsementAction(
      form({
        groupId: "g1",
        type: "MEMBER_DELETION",
        effectiveDate: "2026-08-12",
        memberId: "m1",
      }),
    );
    expect(result?.ok).toBe(false);
    expect(evaluate).toHaveBeenCalledWith({
      tenantId: "t1",
      memberId: "m1",
      groupId: "g1",
      action: "ENDORSEMENT",
    });
    expect(groupFindFirst).toHaveBeenCalledWith({
      where: { id: "g1", tenantId: "t1" },
      select: { renewalDate: true, contributionRate: true },
    });
    expect(peekNextDocumentNumber).not.toHaveBeenCalled();
    expect(endorsementCreate).not.toHaveBeenCalled();
  });

  it("requires a member id for a member-scoped type even in a forged POST", async () => {
    const result = await submitEndorsementAction(
      form({ groupId: "g1", type: "SALARY_CHANGE", effectiveDate: "2026-08-12" }),
    );
    expect(result).toEqual({ ok: false, error: "Select the member this endorsement applies to." });
    expect(evaluate).not.toHaveBeenCalled();
    expect(endorsementCreate).not.toHaveBeenCalled();
  });

  it("does not invent a member requirement for a group-level endorsement", async () => {
    await expect(
      submitEndorsementAction(
        form({ groupId: "g1", type: "GROUP_DATA_CHANGE", effectiveDate: "2026-08-12" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(evaluate).not.toHaveBeenCalled();
    expect(endorsementCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects a group outside the actor's scope before resolving a member", async () => {
    groupFindFirst.mockResolvedValue(null);
    const result = await submitEndorsementAction(
      form({
        groupId: "outside-group",
        type: "MEMBER_DELETION",
        effectiveDate: "2026-08-12",
        memberId: "m1",
      }),
    );
    expect(result?.ok).toBe(false);
    expect(result?.error).toMatch(/group is unavailable/i);
    expect(evaluate).not.toHaveBeenCalled();
    expect(endorsementCreate).not.toHaveBeenCalled();
  });

  it("rejects a forged endorsement type before any scoped read", async () => {
    const result = await submitEndorsementAction(
      form({ groupId: "g1", type: "NOT_A_REAL_TYPE", effectiveDate: "2026-08-12" }),
    );
    expect(result).toEqual({ ok: false, error: "Select a valid endorsement type." });
    expect(groupFindFirst).not.toHaveBeenCalled();
    expect(endorsementCreate).not.toHaveBeenCalled();
  });
});
