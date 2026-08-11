/**
 * WP-V1 — renewal transitions members (V-001..V-008).
 *
 * Pure logic over a mocked prisma (the service-test convention here — no DB):
 *
 *  - bindRenewal carries the prior scheme's ACTIVE members onto the successor
 *    group EXACTLY ONCE: re-pins groupId + packageId + packageVersionId and sets
 *    benefitPeriodAnchor, in one transaction, audited with the member count + ids
 *    (V-002/003). Guards: not-reconciled, already-bound (idempotency), null-pin
 *    successor (fail closed), same-group.
 *  - The prior group's packageVersionId is NOT rewritten and NO benefit-usage row
 *    is touched — old version/coverage stays reconstructable, prior usage stays in
 *    history (V-007 / "old service date resolves old version").
 *  - The benefit-period anchor (WP-V1 additive column) moves the resolved period
 *    off the enrollment anniversary onto the renewal boundary, so a carried-over
 *    member's usage resets exactly once (a different periodStart → a fresh
 *    BenefitUsage row keyed by that periodStart).
 *  - previewRenewal flags over-age CHILD dependants BEFORE bind (V-004) using the
 *    SAME calendar-correct age classifier the SP-6 evaluator uses, and mutates
 *    nothing (V-001).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const tx = {
    member: { findMany: vi.fn(async (_a?: any): Promise<any[]> => []), updateMany: vi.fn(async (_a?: any) => ({ count: 0 })) },
    group: { update: vi.fn(async (_a?: any) => ({})) },
  };
  return {
    tx,
    audit: vi.fn(async (_e?: any) => ({})),
    db: {
      group: { findUnique: vi.fn(async (_a?: any): Promise<any> => null) },
      member: { findMany: vi.fn(async (_a?: any): Promise<any[]> => []) },
      benefitHold: { findMany: vi.fn(async (_a?: any): Promise<any[]> => []) },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: h.db }));
vi.mock("@/server/services/audit-chain.service", () => ({ auditChainService: { append: h.audit } }));

import { renewalService } from "@/server/services/renewal.service";
import { BenefitUsageService } from "@/server/services/benefit-usage.service";

const TENANT = "t1";
const PRIOR = "gPrior";
const SUCC = "gSucc";

function priorGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: PRIOR,
    name: "ACME 2025",
    priorPeriodReconciled: true,
    supersededByGroupId: null,
    ...overrides,
  };
}
function successorGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: SUCC,
    name: "ACME 2026",
    packageId: "pkg-2026",
    packageVersionId: "pv-2026",
    effectiveDate: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.tx.member.updateMany.mockResolvedValue({ count: 0 });
  h.tx.group.update.mockResolvedValue({});
  h.db.benefitHold.findMany.mockResolvedValue([]);
});

describe("bindRenewal — member transition (V-002/003/007)", () => {
  it("carries every ACTIVE member onto the successor: re-pins group/package/version + sets the anchor, once, audited with count + ids", async () => {
    h.db.group.findUnique
      .mockResolvedValueOnce(priorGroup()) // prior
      .mockResolvedValueOnce(successorGroup()); // successor
    h.tx.member.findMany.mockResolvedValue([
      { id: "m1", memberNumber: "ACME-0001" },
      { id: "m2", memberNumber: "ACME-0002" },
    ]);

    const res = await renewalService.bindRenewal(PRIOR, SUCC, TENANT, "actor1");

    expect(res.transitionedMemberCount).toBe(2);
    // Members moved exactly once, with the successor's pin + anchor.
    expect(h.tx.member.updateMany).toHaveBeenCalledTimes(1);
    expect(h.tx.member.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["m1", "m2"] } },
      data: {
        groupId: SUCC,
        packageId: "pkg-2026",
        packageVersionId: "pv-2026",
        benefitPeriodAnchor: new Date("2026-07-01T00:00:00Z"),
      },
    });
    // Only ACTIVE members in the PRIOR group are targeted (idempotent carry).
    expect(h.tx.member.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, groupId: PRIOR, status: "ACTIVE" },
      select: { id: true, memberNumber: true },
    });
    // Audited once with the member count + ids.
    expect(h.audit).toHaveBeenCalledTimes(1);
    const payload = h.audit.mock.calls[0]![0].payload;
    expect(payload.transitionedMemberCount).toBe(2);
    expect(payload.transitionedMemberIds).toEqual(["m1", "m2"]);
    expect(payload.transitionedMemberNumbers).toEqual(["ACME-0001", "ACME-0002"]);
    expect(payload.packageVersionId).toBe("pv-2026");
  });

  it("does NOT rewrite prior-period history: prior group keeps its packageVersionId and no benefit-usage row is touched", async () => {
    h.db.group.findUnique.mockResolvedValueOnce(priorGroup()).mockResolvedValueOnce(successorGroup());
    h.tx.member.findMany.mockResolvedValue([{ id: "m1", memberNumber: "ACME-0001" }]);

    await renewalService.bindRenewal(PRIOR, SUCC, TENANT, "actor1");

    // The prior group is only marked superseded + BOUND — its packageVersionId is never written.
    const priorUpdate = h.tx.group.update.mock.calls.find((c) => c[0].where.id === PRIOR)![0];
    expect(priorUpdate.data).toEqual({ supersededByGroupId: SUCC, renewalStatus: "BOUND" });
    expect(priorUpdate.data).not.toHaveProperty("packageVersionId");
    // No benefit-usage mutation anywhere in the transaction (prior usage preserved).
    expect(h.tx).not.toHaveProperty("benefitUsage");
  });

  it("moves nobody twice — an already-superseded prior group is rejected (idempotency)", async () => {
    h.db.group.findUnique.mockResolvedValueOnce(priorGroup({ supersededByGroupId: "someOtherGroup" }));
    await expect(renewalService.bindRenewal(PRIOR, SUCC, TENANT, "actor1")).rejects.toThrow(/already been bound/i);
    expect(h.tx.member.updateMany).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("fails CLOSED when the successor scheme has no pinned package version (never strand members on a null pin)", async () => {
    h.db.group.findUnique
      .mockResolvedValueOnce(priorGroup())
      .mockResolvedValueOnce(successorGroup({ packageVersionId: null }));
    await expect(renewalService.bindRenewal(PRIOR, SUCC, TENANT, "actor1")).rejects.toThrow(/no pinned package version/i);
    expect(h.tx.member.updateMany).not.toHaveBeenCalled();
  });

  it("requires the prior period to be reconciled before binding", async () => {
    h.db.group.findUnique.mockResolvedValueOnce(priorGroup({ priorPeriodReconciled: false }));
    await expect(renewalService.bindRenewal(PRIOR, SUCC, TENANT, "actor1")).rejects.toThrow(/reconciled/i);
  });

  it("rejects a self-renewal (successor must differ from prior)", async () => {
    await expect(renewalService.bindRenewal(PRIOR, PRIOR, TENANT, "actor1")).rejects.toThrow(/must differ/i);
    expect(h.db.group.findUnique).not.toHaveBeenCalled();
  });

  it("still binds the scheme with zero members (no member update, audit records 0)", async () => {
    h.db.group.findUnique.mockResolvedValueOnce(priorGroup()).mockResolvedValueOnce(successorGroup());
    h.tx.member.findMany.mockResolvedValue([]);
    const res = await renewalService.bindRenewal(PRIOR, SUCC, TENANT, "actor1");
    expect(res.transitionedMemberCount).toBe(0);
    expect(h.tx.member.updateMany).not.toHaveBeenCalled();
    expect(h.audit.mock.calls[0]![0].payload.transitionedMemberCount).toBe(0);
  });
});

describe("previewRenewal — pre-bind reconciliation (V-001/V-004)", () => {
  const members = [
    { id: "p1", memberNumber: "ACME-0001", firstName: "Pat", lastName: "Principal", dateOfBirth: new Date("1980-01-01"), relationship: "PRINCIPAL" },
    { id: "c1", memberNumber: "ACME-0002", firstName: "Old", lastName: "Child", dateOfBirth: new Date("2000-01-01"), relationship: "CHILD" }, // 26 at boundary → over
    { id: "c2", memberNumber: "ACME-0003", firstName: "Young", lastName: "Child", dateOfBirth: new Date("2010-01-01"), relationship: "CHILD" }, // 16 → ok
    { id: "s1", memberNumber: "ACME-0004", firstName: "Sam", lastName: "Spouse", dateOfBirth: new Date("1985-01-01"), relationship: "SPOUSE" }, // adult dependant, no child cap
  ];

  it("flags over-age CHILD dependants as age-out exceptions and reconciles the carry-forward count without mutating", async () => {
    h.db.group.findUnique.mockResolvedValueOnce({
      id: PRIOR,
      name: "ACME 2025",
      renewalDate: new Date("2026-07-01T00:00:00Z"),
      effectiveDate: new Date("2025-07-01T00:00:00Z"),
      supersededByGroupId: null,
      priorPeriodReconciled: true,
      package: { maxAge: 65, dependentMaxAge: 24 },
    });
    h.db.member.findMany.mockResolvedValue(members);

    const preview = await renewalService.previewRenewal(PRIOR, TENANT);

    expect(preview.carryForwardCount).toBe(4);
    // Only the 26-year-old CHILD ages out; the 16yo child, the spouse and the principal do not.
    expect(preview.ageOutExceptions).toHaveLength(1);
    expect(preview.ageOutExceptions[0]).toMatchObject({
      memberId: "c1",
      memberNumber: "ACME-0002",
      relationship: "CHILD",
      age: 26,
      dependentMaxAge: 24,
    });
    // Preview reads only — never opens a transaction, never audits.
    expect(h.db.$transaction).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.tx.member.updateMany).not.toHaveBeenCalled();
  });

  it("surfaces pre-auth holds that outlive the renewal boundary (V-008 visibility)", async () => {
    h.db.group.findUnique.mockResolvedValueOnce({
      id: PRIOR, name: "ACME 2025", renewalDate: new Date("2026-07-01T00:00:00Z"),
      effectiveDate: new Date("2025-07-01T00:00:00Z"), supersededByGroupId: null,
      priorPeriodReconciled: true, package: { maxAge: 65, dependentMaxAge: 24 },
    });
    h.db.member.findMany.mockResolvedValue(members);
    h.db.benefitHold.findMany.mockResolvedValue([
      { id: "hold1", memberId: "p1", benefitCategory: "INPATIENT", heldAmount: 50000, expiresAt: new Date("2026-09-01"), preAuthId: "pa1" },
    ]);

    const preview = await renewalService.previewRenewal(PRIOR, TENANT);
    expect(preview.straddlingHolds).toHaveLength(1);
    expect(preview.straddlingHolds[0]).toMatchObject({ holdId: "hold1", benefitCategory: "INPATIENT", heldAmount: 50000, preAuthId: "pa1" });
    // The hold query is bounded to the renewal boundary (expiresAt > newCoverStart).
    const holdWhere = h.db.benefitHold.findMany.mock.calls[0]![0].where;
    expect(holdWhere.status).toBe("ACTIVE");
    expect(holdWhere.expiresAt).toEqual({ gt: new Date("2026-07-01T00:00:00Z") });
  });
});

describe("benefit-period anchor (WP-V1 additive column) — usage resets at the renewal boundary (V-007)", () => {
  const now = new Date(2026, 7, 1); // 2026-08-01 local

  function txFor(member: { packageVersionId: string | null; enrollmentDate: Date; benefitPeriodAnchor: Date | null }) {
    return {
      member: { findUnique: vi.fn(async () => member) },
      benefitConfig: { findFirst: vi.fn(async () => ({ id: "cfg1", annualSubLimit: 100000 })) },
    } as any;
  }

  it("anchors the period to enrollment when benefitPeriodAnchor is NULL (unchanged legacy behaviour)", async () => {
    const cfg = await BenefitUsageService.resolveConfig(
      txFor({ packageVersionId: "pv-2025", enrollmentDate: new Date("2024-03-15"), benefitPeriodAnchor: null }),
      "m1",
      "OUTPATIENT",
      now,
    );
    expect(cfg!.periodStart.getTime()).toBe(new Date(2026, 2, 15).getTime()); // 2026-03-15 (enrollment anniversary)
  });

  it("anchors the period to the renewal boundary when benefitPeriodAnchor is set — a DIFFERENT periodStart → a fresh usage row (reset once)", async () => {
    const enrollmentAnchored = await BenefitUsageService.resolveConfig(
      txFor({ packageVersionId: "pv-2026", enrollmentDate: new Date("2024-03-15"), benefitPeriodAnchor: null }),
      "m1", "OUTPATIENT", now,
    );
    const renewalAnchored = await BenefitUsageService.resolveConfig(
      txFor({ packageVersionId: "pv-2026", enrollmentDate: new Date("2024-03-15"), benefitPeriodAnchor: new Date("2026-07-01") }),
      "m1", "OUTPATIENT", now,
    );
    // Renewal-anchored period starts at the boundary, not the enrollment anniversary.
    expect(renewalAnchored!.periodStart.getTime()).toBe(new Date(2026, 6, 1).getTime()); // 2026-07-01
    expect(renewalAnchored!.periodEnd.getTime()).toBe(new Date(2027, 6, 1).getTime()); // 2027-07-01
    // Crucially it differs from the enrollment-anchored periodStart — so the
    // BenefitUsage row (keyed by periodStart) is a NEW row: usage resets, the old
    // enrollment-anchored row is left untouched as history.
    expect(renewalAnchored!.periodStart.getTime()).not.toBe(enrollmentAnchored!.periodStart.getTime());
  });

  it("periodFor rolls annually from whatever anchor date it is given", () => {
    const p = BenefitUsageService.periodFor(new Date("2026-07-01"), new Date(2026, 7, 1));
    expect(p.periodStart.getTime()).toBe(new Date(2026, 6, 1).getTime());
    expect(p.periodEnd.getTime()).toBe(new Date(2027, 6, 1).getTime());
    // A year after the boundary the same anchor rolls forward once (still resets once per year).
    const nextYear = BenefitUsageService.periodFor(new Date("2026-07-01"), new Date(2027, 8, 1));
    expect(nextYear.periodStart.getTime()).toBe(new Date(2027, 6, 1).getTime());
  });
});
