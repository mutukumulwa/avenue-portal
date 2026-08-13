/**
 * UAT-HF P08.01 acceptance — "HR can submit a leaver without route knowledge;
 * request has member, group, last covered day, reason, source, maker, and
 * reference; no cover changes before approval."
 *
 * DEF-004 (S2): "No termination, leaver, removal, exit or end-of-cover control
 * exists anywhere in the HR portal. Roster > 'Add Member' and Endorsement
 * Requests > '+ New Endorsement' both navigate to /hr/roster/new, which is a
 * 'Member Addition' form only. The member detail page /hr/roster/<id> exposes
 * only 'View All Endorsements' and no lifecycle action. The Endorsement Requests
 * list offers a 'Member Deletion' type FILTER, advertising a capability with no
 * creation path behind it."
 *
 * Business impact from the register: "terminated staff continue to appear ACTIVE
 * on the employer roster and remain eligible, so claims can be incurred against
 * a leaver until someone intervenes outside the HR portal."
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const mockPrisma = vi.hoisted(() => ({
  member: { findFirst: vi.fn() },
  endorsement: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const session = vi.hoisted(() => ({
  user: { id: "hr-user-1", tenantId: "t1", groupId: "g1" },
}));
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => session),
  ROLES: { HR: ["HR_MANAGER"] },
}));

const writeAudit = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/audit", () => ({ writeAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
// P08.04: the action now uses the retrying allocator rather than peek + create.
// The stub calls through with a fixed number so these tests still assert the
// ACTION's behaviour; the allocator's own retry is covered by
// tests/lib/document-number.test.ts.
vi.mock("@/lib/document-number", () => ({
  createWithDocumentNumber: vi.fn(
    async (
      _prefix: string,
      _findLatest: (yp: string) => Promise<string | null>,
      create: (n: string) => Promise<unknown>,
    ) => create("END-2026-00042"),
  ),
}));

const { submitLeaverRequestAction, withdrawLeaverRequestAction } = await import(
  "@/app/(hr)/hr/roster/[memberId]/leaver/actions"
);

const ACTIVE_MEMBER = {
  id: "m1",
  memberNumber: "UX26-2026-00030",
  firstName: "Grace",
  lastName: "Nakato",
  status: "ACTIVE",
  relationship: "PRINCIPAL",
  coverStartDate: new Date("2026-01-01"),
  dependents: [{ id: "d1", firstName: "Sam", lastName: "Nakato" }],
};

function form(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const base: Record<string, string> = {
    memberId: "m1",
    lastDay: "2026-08-31",
    reason: "Resignation",
    sourceReference: "Resignation letter 2026-08-01",
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  session.user.groupId = "g1";
  mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
  mockPrisma.endorsement.findFirst.mockResolvedValue(null);
  mockPrisma.endorsement.create.mockResolvedValue({ id: "e1", endorsementNumber: "END-2026-00042" });
  mockPrisma.endorsement.updateMany.mockResolvedValue({ count: 1 });
});

describe("P08.01 the leaver request exists at all", () => {
  it("creates a governed MEMBER_DELETION endorsement", async () => {
    await expect(submitLeaverRequestAction(form())).rejects.toThrow(/NEXT_REDIRECT/);
    const arg = mockPrisma.endorsement.create.mock.calls[0][0];
    expect(arg.data.type).toBe("MEMBER_DELETION");
    expect(arg.data.status).toBe("SUBMITTED");
  });

  it("carries member, group, last covered day, reason, source and maker", async () => {
    // The plan's acceptance list, asserted item by item.
    await expect(submitLeaverRequestAction(form())).rejects.toThrow(/NEXT_REDIRECT/);
    const { data } = mockPrisma.endorsement.create.mock.calls[0][0];
    expect(data.groupId).toBe("g1");
    expect(data.requestedBy).toBe("hr-user-1");
    expect(data.changeDetails).toMatchObject({
      memberId: "m1",
      memberNumber: "UX26-2026-00030",
      lastDay: "2026-08-31",
      reason: "Resignation",
      sourceReference: "Resignation letter 2026-08-01",
      raisedVia: "HR_PORTAL",
    });
  });

  it("gets a reference number", async () => {
    await expect(submitLeaverRequestAction(form())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockPrisma.endorsement.create.mock.calls[0][0].data.endorsementNumber).toBe("END-2026-00042");
  });

  it("records how many dependants the departure takes with it", async () => {
    // Ending a principal ends the household; a checker who cannot see that is
    // approving a bigger change than they think.
    await expect(submitLeaverRequestAction(form())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockPrisma.endorsement.create.mock.calls[0][0].data.changeDetails.dependantsAffected).toBe(1);
  });

  it("audits the request", async () => {
    await expect(submitLeaverRequestAction(form())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "HR_LEAVER_REQUESTED", userId: "hr-user-1" }),
    );
  });

  it("sends the operator somewhere that confirms it", async () => {
    await expect(submitLeaverRequestAction(form())).rejects.toThrow(/NEXT_REDIRECT:\/hr\/endorsements\/e1\?raised=1/);
  });
});

describe("P08.01 NO cover changes before approval", () => {
  it("touches no member row", async () => {
    // The acceptance criterion, and the reason an employer-side control is safe
    // to give at all: HR reports, the TPA decides.
    await expect(submitLeaverRequestAction(form())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockPrisma.member.findFirst).toHaveBeenCalled();
    expect((mockPrisma.member as Record<string, unknown>).update).toBeUndefined();
  });

  it("does not guess the pro-rata credit", async () => {
    // Pro-rata is the TPA's calculation. An employer-side number that later
    // disagrees with the invoice is worse than no number.
    await expect(submitLeaverRequestAction(form())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockPrisma.endorsement.create.mock.calls[0][0].data.proratedAmount).toBe(0);
  });
});

describe("P08.01 the request cannot reach another employer's staff", () => {
  it("scopes the member lookup by tenant AND group", async () => {
    await expect(submitLeaverRequestAction(form())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockPrisma.member.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "m1", tenantId: "t1", groupId: "g1",
    });
  });

  it("refuses a member who is not on this roster", async () => {
    mockPrisma.member.findFirst.mockResolvedValue(null);
    const r = await submitLeaverRequestAction(form({ memberId: "someone-else" }));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/not on your roster/i) });
    expect(mockPrisma.endorsement.create).not.toHaveBeenCalled();
  });

  it("refuses an HR account with no group rather than querying every group", async () => {
    // PRIVACY-S1-B / N3: Prisma drops an undefined key, so an unguarded groupId
    // would widen this to the whole tenant.
    session.user.groupId = "";
    const r = await submitLeaverRequestAction(form());
    expect(r).toMatchObject({ ok: false });
    expect(mockPrisma.member.findFirst).not.toHaveBeenCalled();
  });
});

describe("P08.01 the last covered day is validated", () => {
  it("requires one", async () => {
    const r = await submitLeaverRequestAction(form({ lastDay: "" }));
    expect(r).toMatchObject({ ok: false });
    expect((r as { fieldErrors: Record<string, string[]> }).fieldErrors.lastDay).toBeDefined();
    expect(mockPrisma.endorsement.create).not.toHaveBeenCalled();
  });

  it("refuses a day before cover started", async () => {
    const r = await submitLeaverRequestAction(form({ lastDay: "2025-12-01" }));
    expect((r as { fieldErrors: Record<string, string[]> }).fieldErrors.lastDay[0]).toMatch(/cover started/i);
  });

  it("refuses a leaver back-dated beyond the horizon, and says how far", async () => {
    const r = await submitLeaverRequestAction(form({ lastDay: "2026-01-02" }));
    const msg = (r as { fieldErrors: Record<string, string[]> }).fieldErrors.lastDay[0];
    expect(msg).toMatch(/days ago/);
    expect(msg).toMatch(/back-dated override/i);
  });

  it("stores the same calendar date as the effective date", async () => {
    // The approval path closes cover from `lastDay`; storing a different value
    // in effectiveDate is how the two drift by a day of claims.
    await expect(submitLeaverRequestAction(form({ lastDay: "2026-08-20" }))).rejects.toThrow(/NEXT_REDIRECT/);
    const { data } = mockPrisma.endorsement.create.mock.calls[0][0];
    expect(data.changeDetails.lastDay).toBe("2026-08-20");
    expect(new Date(data.effectiveDate).toISOString().slice(0, 10)).toBe("2026-08-20");
  });
});

describe("P08.01 reason and E-015 evidence are required at creation", () => {
  it("requires a reason", async () => {
    const r = await submitLeaverRequestAction(form({ reason: "" }));
    expect((r as { fieldErrors: Record<string, string[]> }).fieldErrors.reason).toBeDefined();
  });

  it("requires a source reference — MEMBER_DELETION is material (DEF-046)", async () => {
    // Without this the leaver rail would be fixed at the HR end and still dead
    // at the TPA end: raised, and never approvable.
    const r = await submitLeaverRequestAction(form({ sourceReference: "" }));
    expect((r as { fieldErrors: Record<string, string[]> }).fieldErrors.sourceReference).toBeDefined();
    expect(mockPrisma.endorsement.create).not.toHaveBeenCalled();
  });

  it("reports every problem at once, not one submit at a time", async () => {
    const r = await submitLeaverRequestAction(form({ reason: "", sourceReference: "", lastDay: "" }));
    const fe = (r as { fieldErrors: Record<string, string[]> }).fieldErrors;
    expect(Object.keys(fe).sort()).toEqual(["lastDay", "reason", "sourceReference"]);
  });
});

describe("P08.01 one departure cannot become two credits", () => {
  it("refuses when a leaver request is already in flight, and names it", async () => {
    mockPrisma.endorsement.findFirst.mockResolvedValue({
      endorsementNumber: "END-2026-00011", status: "SUBMITTED",
    });
    const r = await submitLeaverRequestAction(form());
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("END-2026-00011") });
    expect(mockPrisma.endorsement.create).not.toHaveBeenCalled();
  });

  it("refuses a member who is not active", async () => {
    mockPrisma.member.findFirst.mockResolvedValue({ ...ACTIVE_MEMBER, status: "LAPSED" });
    const r = await submitLeaverRequestAction(form());
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/already lapsed/i) });
  });
});

describe("P08.01 withdraw before approval", () => {
  it("cancels an undecided request the HR user raised", async () => {
    const fd = new FormData();
    fd.set("endorsementId", "e1");
    fd.set("reason", "Resignation retracted");
    const r = await withdrawLeaverRequestAction(fd);
    expect(r).toBeUndefined();

    const call = mockPrisma.endorsement.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      id: "e1", tenantId: "t1", groupId: "g1", requestedBy: "hr-user-1",
    });
    expect(call.where.status.in).toEqual(["DRAFT", "SUBMITTED", "UNDER_REVIEW"]);
    expect(call.data.status).toBe("CANCELLED");
  });

  it("requires a reason", async () => {
    const fd = new FormData();
    fd.set("endorsementId", "e1");
    const r = await withdrawLeaverRequestAction(fd);
    expect(r).toMatchObject({ ok: false });
    expect(mockPrisma.endorsement.updateMany).not.toHaveBeenCalled();
  });

  it("reports a lost race rather than silently doing nothing", async () => {
    // The checker approved while the employer was withdrawing.
    mockPrisma.endorsement.updateMany.mockResolvedValue({ count: 0 });
    const fd = new FormData();
    fd.set("endorsementId", "e1");
    fd.set("reason", "changed mind");
    const r = await withdrawLeaverRequestAction(fd);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/already been actioned/i) });
  });

  it("audits the withdrawal", async () => {
    const fd = new FormData();
    fd.set("endorsementId", "e1");
    fd.set("reason", "wrong employee");
    await withdrawLeaverRequestAction(fd);
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "HR_LEAVER_WITHDRAWN" }));
  });
});

/**
 * The surfaces. DEF-004 is a *missing capability*, so proving the action exists
 * is only half of it — the run's complaint was that nothing on screen led to it.
 */
describe("P08.01 the HR portal now leads somewhere", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("the member detail page offers the lifecycle action it lacked", () => {
    // "exposes only 'View All Endorsements' and no lifecycle action"
    const page = read("src/app/(hr)/hr/roster/[memberId]/page.tsx");
    expect(page).toMatch(/Report leaving/);
    expect(page).toContain("/leaver");
  });

  it("…only for an ACTIVE member with nothing already in flight", () => {
    const page = read("src/app/(hr)/hr/roster/[memberId]/page.tsx");
    expect(page).toMatch(/member\.status === "ACTIVE"/);
    expect(page).toContain("openLeaverRequest");
  });

  it("the roster list offers it too, so no route knowledge is needed", () => {
    const page = read("src/app/(hr)/hr/roster/page.tsx");
    expect(page).toMatch(/Report leaving/);
    expect(page).toMatch(/aria-label=\{`Report \$\{m\.firstName\}/);
  });

  it("'+ New Endorsement' no longer means only 'Add Member'", () => {
    // "advertising a capability with no creation path behind it"
    const page = read("src/app/(hr)/hr/endorsements/page.tsx");
    // Match the JSX text node on its own line, not the comment that quotes the
    // old label to explain why it went.
    expect(page).not.toMatch(/^\s*\+ New Endorsement\s*$/m);
    expect(page).toMatch(/^\s*Add a member\s*$/m);
    expect(page).toMatch(/^\s*Report a leaver\s*$/m);
  });

  it("the form says plainly that submitting does not end cover", () => {
    const form = read("src/app/(hr)/hr/roster/[memberId]/leaver/HRLeaverForm.tsx");
    expect(form).toMatch(/does not end cover by itself/i);
  });

  it("the form reads the inclusive last day back in words (CT-034)", () => {
    // "last day of cover" vs "date cover ends" differ by one day, and that day
    // is a day of claims.
    const form = read("src/app/(hr)/hr/roster/[memberId]/leaver/HRLeaverForm.tsx");
    expect(form).toMatch(/stays covered <strong>through the whole of/);
    expect(form).toMatch(/not covered from the following day/);
  });

  it("the form names the dependants who lose cover with the principal", () => {
    const form = read("src/app/(hr)/hr/roster/[memberId]/leaver/HRLeaverForm.tsx");
    expect(form).toMatch(/lose cover too/);
  });

  it("the HR endorsement detail offers withdraw to its maker only", () => {
    const page = read("src/app/(hr)/hr/endorsements/[id]/page.tsx");
    expect(page).toContain("canWithdraw");
    expect(page).toContain("endorsement.requestedBy === session.user.id");
    expect(page).toContain("<WithdrawRequest");
  });

  it("a submitted request confirms itself", () => {
    const page = read("src/app/(hr)/hr/endorsements/[id]/page.tsx");
    expect(page).toContain('role="status"');
    expect(page).toMatch(/Request sent to your scheme administrator/);
  });
});
