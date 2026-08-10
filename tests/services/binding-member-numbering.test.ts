/**
 * WP-3.5C / CT-004 — bound members must be minted with the owning CLIENT's
 * member-number prefix, not the operator default. binding.service previously
 * called nextMemberNumber(tenantId) WITHOUT the clientId, so every quotation-bound
 * member got "MVX-…" instead of e.g. "LMU-…".
 *
 * Unlike binding-concurrency.test.ts, this suite does NOT mock
 * member-numbering.service — the REAL resolveMemberPrefix runs and reads
 * Client.memberNumberPrefix ("LMU"), proving the clientId is threaded through
 * createMemberships end to end.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => {
  const state: any = {
    quotation: {
      findUnique: vi.fn(),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    group: {
      count: vi.fn(async () => 0),
      create: vi.fn(async (a: any) => ({ id: "grp1", ...a.data })),
      delete: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => ({ clientId: "clientLMU" })),
    },
    client: {
      // The real resolveMemberPrefix reads this — a conforming LMU prefix.
      findFirst: vi.fn(async () => ({ memberNumberPrefix: "LMU" })),
    },
    member: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => [] as { memberNumber: string }[]),
      create: vi.fn(async (a: any) => ({ id: `m-${a.data.memberNumber}`, ...a.data })),
    },
    membershipExclusion: { create: vi.fn(async () => ({})) },
    waitingPeriodApplication: { create: vi.fn(async () => ({})) },
    memberCoveragePeriod: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    // F-PIN-2 / WP-3.5D: binding resolves the package's current version (pin) + age caps.
    package: { findUnique: vi.fn(async () => ({ currentVersionId: "pv1", maxAge: 65, dependentMaxAge: 24 })) },
    $transaction: vi.fn(async (fn: any) => fn(state)),
  };
  return state;
});

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/audit-chain.service", () => ({
  auditChainService: { append: vi.fn(async () => ({})) },
}));
vi.mock("@/server/services/clientResolve", () => ({
  resolveSchemeClientId: vi.fn(async () => "clientLMU"),
}));
// NOTE: member-numbering.service is intentionally REAL here.

import { bindingService } from "@/server/services/binding.service";

const YEAR = new Date().getFullYear();

const acceptedQuote = (over: any = {}) => ({
  id: "q1",
  tenantId: "t1",
  quoteNumber: "QUO-2026-00001",
  status: "ACCEPTED",
  groupId: null,
  packageId: "pkg1",
  requestedCoverStart: new Date("2026-08-01"),
  legalName: "Lakeview Ltd",
  prospectName: "Lakeview",
  prospectIndustry: "Tech",
  prospectContact: "Jane",
  billingContactEmail: "b@lmu.test",
  prospectEmail: "p@lmu.test",
  ratePerMember: 1000,
  brokerId: null,
  clientType: "CORPORATE",
  fundingMode: "INSURED",
  lives: [
    {
      id: "l1",
      role: "PRINCIPAL",
      firstName: "John",
      lastName: "Doe",
      nationalId: null,
      dateOfBirth: new Date("1990-01-01"),
      gender: "MALE",
      principalLifeId: null,
      decision: null,
    },
    {
      id: "l2",
      role: "DEPENDANT",
      // WP-3.5F: dependants derive relationship from ROLE (→ CHILD), not gender, so
      // this life is now a CHILD subject to the dependant age cap — a child-aged DOB
      // keeps the happy path valid (a female born 1992 would age out as a CHILD).
      firstName: "Jane",
      lastName: "Doe",
      nationalId: null,
      dateOfBirth: new Date("2015-06-01"),
      gender: "FEMALE",
      principalLifeId: "l1",
      decision: null,
    },
  ],
  acceptance: { id: "acc1" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.quotation.updateMany.mockResolvedValue({ count: 1 });
  db.group.count.mockResolvedValue(0);
  db.group.create.mockImplementation(async (a: any) => ({ id: "grp1", ...a.data }));
  db.group.findUnique.mockResolvedValue({ clientId: "clientLMU" });
  db.client.findFirst.mockResolvedValue({ memberNumberPrefix: "LMU" });
  db.member.count.mockResolvedValue(0);
  db.member.findMany.mockResolvedValue([]);
  db.member.create.mockImplementation(async (a: any) => ({ id: `m-${a.data.memberNumber}`, ...a.data }));
});

const mintedNumbers = () => db.member.create.mock.calls.map((c: any) => c[0].data.memberNumber);

describe("createMemberships — client member-number prefix (WP-3.5C / CT-004)", () => {
  it("mints bound members with the client prefix (LMU-…), NOT the operator default (MVX-…)", async () => {
    db.quotation.findUnique.mockResolvedValue(acceptedQuote());

    await bindingService.createMemberships("q1", "t1", "maker1");

    const numbers = mintedNumbers();
    expect(numbers).toHaveLength(2); // principal + dependant
    for (const n of numbers) {
      expect(n).toMatch(new RegExp(`^LMU-${YEAR}-\\d{5,}$`));
      expect(n.startsWith("MVX-")).toBe(false);
    }
    // The real resolveMemberPrefix consulted the client master for the prefix.
    expect(db.client.findFirst).toHaveBeenCalled();
  });

  it("pins the group + bound members to the package current version (F-PIN-2)", async () => {
    db.quotation.findUnique.mockResolvedValue(acceptedQuote());

    await bindingService.createMemberships("q1", "t1", "maker1");

    // Group carries the pin so members inherit a fixed benefit version.
    expect(db.group.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ packageVersionId: "pv1" }) }),
    );
    // Every member (principal + dependant) has a NON-NULL pin — SP-6 would otherwise
    // read NOT_YET_ENROLLED off a null pin.
    const pins = db.member.create.mock.calls.map((c: any) => c[0].data.packageVersionId);
    expect(pins).toHaveLength(2);
    for (const p of pins) expect(p).toBe("pv1");
  });

  it("rejects binding when a life is over the package dependant max age (WP-3.5D)", async () => {
    db.package.findUnique.mockResolvedValueOnce({ currentVersionId: "pv1", maxAge: 65, dependentMaxAge: 24 });
    db.quotation.findUnique.mockResolvedValue(
      acceptedQuote({
        lives: [
          { id: "l1", role: "PRINCIPAL", firstName: "John", lastName: "Doe", nationalId: null,
            dateOfBirth: new Date("1990-01-01"), gender: "MALE", principalLifeId: null, decision: null },
          // Male dependant (→ CHILD) born 1990 → ~36y as of 2026-08-01 cover start, over 24.
          { id: "l2", role: "DEPENDANT", firstName: "Old", lastName: "Child", nationalId: null,
            dateOfBirth: new Date("1990-01-01"), gender: "MALE", principalLifeId: "l1", decision: null },
        ],
      }),
    );

    await expect(bindingService.createMemberships("q1", "t1", "maker1")).rejects.toThrow(
      /maximum dependant age/i,
    );
    // Pre-validated BEFORE any write — no group / member created.
    expect(db.group.create).not.toHaveBeenCalled();
    expect(db.member.create).not.toHaveBeenCalled();
  });

  it("uses the existing group's client on a renewal/re-bind (groupId already set)", async () => {
    db.quotation.findUnique.mockResolvedValue(
      acceptedQuote({
        groupId: "grp-existing",
        lives: [
          {
            id: "l1",
            role: "PRINCIPAL",
            firstName: "A",
            lastName: "B",
            nationalId: null,
            dateOfBirth: new Date("1990-01-01"),
            gender: "MALE",
            principalLifeId: null,
            decision: null,
          },
        ],
      }),
    );
    db.member.count.mockResolvedValue(0); // no prior members → binding proceeds
    db.group.findUnique.mockResolvedValue({ clientId: "clientLMU" });

    await bindingService.createMemberships("q1", "t1", "maker1");

    expect(db.group.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "grp-existing" } }),
    );
    expect(mintedNumbers()[0]).toMatch(new RegExp(`^LMU-${YEAR}-\\d{5,}$`));
  });

  it("continues the client series numerically past 99999 (no lexical collapse)", async () => {
    db.quotation.findUnique.mockResolvedValue(
      acceptedQuote({
        lives: [
          {
            id: "l1",
            role: "PRINCIPAL",
            firstName: "A",
            lastName: "B",
            nationalId: null,
            dateOfBirth: new Date("1990-01-01"),
            gender: "MALE",
            principalLifeId: null,
            decision: null,
          },
        ],
      }),
    );
    // A 6-digit max is present; lexical desc would collapse to 99999 → 100000 (collision).
    db.member.findMany.mockResolvedValue([
      { memberNumber: `LMU-${YEAR}-99999` },
      { memberNumber: `LMU-${YEAR}-100000` },
    ]);

    await bindingService.createMemberships("q1", "t1", "maker1");

    expect(mintedNumbers()[0]).toBe(`LMU-${YEAR}-100001`);
  });
});
