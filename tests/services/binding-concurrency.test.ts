/**
 * SYS-1 (WP-B3): binding transitions must be concurrency-safe.
 *  - captureAcceptance claims SENT→ACCEPTED atomically (as the first write in a
 *    transaction) → one acceptance per quotation, no double-transition.
 *  - createMemberships claims the quotation's empty group slot atomically
 *    (groupId null → this group) → exactly one membership set per quotation. The
 *    loser drops the orphan group it created and surfaces CONFLICT (no double-bind).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => {
  const state: any = {
    quotation: {
      findUnique: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    quotationAcceptance: { create: vi.fn(async (a: any) => ({ id: "acc1", ...a.data })) },
    group: {
      count: vi.fn(async () => 0),
      create: vi.fn(async (a: any) => ({ id: "grp1", ...a.data })),
      delete: vi.fn(async () => ({})),
    },
    member: {
      count: vi.fn(async () => 0),
      create: vi.fn(async (a: any) => ({ id: "m1", ...a.data })),
    },
    membershipExclusion: { create: vi.fn(async () => ({})) },
    waitingPeriodApplication: { create: vi.fn(async () => ({})) },
    memberCoveragePeriod: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: any) => fn(state)),
  };
  return state;
});

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/audit-chain.service", () => ({ auditChainService: { append: vi.fn(async () => ({})) } }));
vi.mock("@/server/services/clientResolve", () => ({ resolveSchemeClientId: vi.fn(async () => "client1") }));
vi.mock("@/server/services/member-numbering.service", () => ({ resolveMemberPrefix: vi.fn(async () => "MEV") }));

import { bindingService } from "@/server/services/binding.service";

const sentQuote = (over: any = {}) => ({
  id: "q1", tenantId: "t1", quoteNumber: "QUO-2026-00001",
  status: "SENT", requestedCoverStart: new Date("2026-08-01"),
  ...over,
});

const acceptedQuote = (over: any = {}) => ({
  id: "q1", tenantId: "t1", quoteNumber: "QUO-2026-00001",
  status: "ACCEPTED", groupId: null, packageId: "pkg1",
  requestedCoverStart: new Date("2026-08-01"),
  legalName: "Acme Ltd", prospectName: "Acme", prospectIndustry: "Tech",
  prospectContact: "Jane", billingContactEmail: "b@acme.test", prospectEmail: "p@acme.test",
  ratePerMember: 1000, brokerId: null, clientType: "CORPORATE", fundingMode: "INSURED",
  lives: [
    { id: "l1", role: "PRINCIPAL", firstName: "John", lastName: "Doe", nationalId: null,
      dateOfBirth: new Date("1990-01-01"), gender: "MALE", principalLifeId: null, decision: null },
  ],
  acceptance: { id: "acc1" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.quotation.updateMany.mockResolvedValue({ count: 1 });
  db.group.count.mockResolvedValue(0);
  db.member.count.mockResolvedValue(0);
});

describe("captureAcceptance — atomic SENT→ACCEPTED (SYS-1)", () => {
  it("claims the transition, then records the acceptance", async () => {
    db.quotation.findUnique.mockResolvedValue(sentQuote());
    const acc = await bindingService.captureAcceptance("q1", "t1", "PORTAL_CLICK" as never, "u1");
    expect(db.quotation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "q1", tenantId: "t1", status: "SENT" }),
        data: expect.objectContaining({ status: "ACCEPTED" }),
      }),
    );
    expect(db.quotationAcceptance.create).toHaveBeenCalledTimes(1);
    expect(acc.id).toBe("acc1");
  });

  it("a concurrent second accept loses the claim — throws, no acceptance recorded", async () => {
    db.quotation.findUnique.mockResolvedValue(sentQuote());
    db.quotation.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      bindingService.captureAcceptance("q1", "t1", "PORTAL_CLICK" as never, "u1"),
    ).rejects.toThrow(/just actioned by another user/i);
    expect(db.quotationAcceptance.create).not.toHaveBeenCalled();
  });
});

describe("createMemberships — atomic double-bind guard (SYS-1)", () => {
  it("claims the quotation's empty group slot, then creates the members", async () => {
    db.quotation.findUnique.mockResolvedValue(acceptedQuote());
    const res = await bindingService.createMemberships("q1", "t1", "maker1");
    expect(db.group.create).toHaveBeenCalledTimes(1);
    expect(db.quotation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "q1", tenantId: "t1", groupId: null }),
        data: expect.objectContaining({ groupId: "grp1" }),
      }),
    );
    expect(db.member.create).toHaveBeenCalledTimes(1);
    expect(res.createdMemberIds).toEqual(["m1"]);
  });

  it("a concurrent bind loses the group-slot claim — throws, drops the orphan group, creates no members", async () => {
    db.quotation.findUnique.mockResolvedValue(acceptedQuote());
    db.quotation.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      bindingService.createMemberships("q1", "t1", "maker1"),
    ).rejects.toThrow(/already in progress/i);
    expect(db.group.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "grp1" } }));
    expect(db.member.create).not.toHaveBeenCalled();
  });

  it("rejects a second membership set when the quotation already carries a group", async () => {
    db.quotation.findUnique.mockResolvedValue(acceptedQuote({ groupId: "grp-existing" }));
    db.member.count.mockResolvedValue(2); // members already created for this quotation
    await expect(
      bindingService.createMemberships("q1", "t1", "maker1"),
    ).rejects.toThrow(/already been created/i);
    expect(db.member.create).not.toHaveBeenCalled();
  });
});
