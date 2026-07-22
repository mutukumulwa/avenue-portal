/**
 * Claims Autopilot F2.6 — backfill script logic (unit, mocked prisma).
 * Proves: report-only writes nothing; --apply is idempotent; policies-non-live
 * detection; safe rollback.
 */
import { describe, it, expect, vi } from "vitest";
import {
  claimSuspectFingerprint,
  runBackfill,
  verifyPoliciesNonLive,
  rollbackDisableLive,
} from "../../scripts/backfill-claim-intake-provenance";

const claimRow = (over: Record<string, unknown> = {}) => ({
  id: "clm-1", tenantId: "t1", providerId: "prv-1", providerBranchId: null, memberId: "mbr-1",
  serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", dateOfService: new Date("2026-06-01"),
  currency: "UGX", billedAmount: 1500,
  claimLines: [{ cptCode: "99213", icdCode: "J06.9", quantity: 1, billedAmount: 1500 }],
  ...over,
});

type Db = Parameters<typeof runBackfill>[0];

function mockDb(over: {
  claimCount?: number;
  missing?: unknown[];
  policies?: unknown[];
  succeededOrphans?: number;
  update?: ReturnType<typeof vi.fn>;
  updateMany?: ReturnType<typeof vi.fn>;
}) {
  return {
    claim: {
      count: vi.fn(async () => over.claimCount ?? 0),
      findMany: vi.fn(async () => over.missing ?? []),
      update: over.update ?? vi.fn(async () => ({})),
    },
    autoAdjudicationPolicy: {
      findMany: vi.fn(async () => over.policies ?? []),
      count: vi.fn(async () => (over.policies ?? []).length),
      updateMany: over.updateMany ?? vi.fn(async () => ({ count: 0 })),
    },
    claimIntakeReceipt: { count: vi.fn(async () => over.succeededOrphans ?? 0) },
    claimProcessingRun: { count: vi.fn(async () => 0) },
  } as unknown as Db;
}

describe("F2.6 — claimSuspectFingerprint", () => {
  it("produces a versioned suspect fingerprint, content-sensitive and deterministic", () => {
    const a = claimSuspectFingerprint(claimRow());
    const b = claimSuspectFingerprint(claimRow());
    expect(a).toMatch(/^suspect:v1:[a-f0-9]{64}$/);
    expect(a).toBe(b);
    const changed = claimSuspectFingerprint(claimRow({ billedAmount: 9999, claimLines: [{ cptCode: "99213", icdCode: "J06.9", quantity: 1, billedAmount: 9999 }] }));
    expect(changed).not.toBe(a);
  });

  it("is stable across lowercase vs uppercase codes (mirrors canonical normalization)", () => {
    const upper = claimSuspectFingerprint(claimRow({ claimLines: [{ cptCode: "99213", icdCode: "J06.9", quantity: 1, billedAmount: 1500 }] }));
    const lower = claimSuspectFingerprint(claimRow({ claimLines: [{ cptCode: "99213", icdCode: "j06.9", quantity: 1, billedAmount: 1500 }] }));
    expect(lower).toBe(upper);
  });
});

describe("F2.6 — runBackfill", () => {
  it("report-only writes nothing", async () => {
    const update = vi.fn(async () => ({}));
    const db = mockDb({ claimCount: 3, missing: [claimRow(), claimRow({ id: "clm-2" })], update });
    const r = await runBackfill(db, { apply: false });
    expect(r.applied).toBe(false);
    expect(r.claimsMissingSuspectFp).toBe(2);
    expect(r.claimsUpdated).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it("--apply backfills each missing claim", async () => {
    const update = vi.fn(async () => ({}));
    const db = mockDb({ claimCount: 3, missing: [claimRow(), claimRow({ id: "clm-2" })], update });
    const r = await runBackfill(db, { apply: true });
    expect(r.applied).toBe(true);
    expect(r.claimsUpdated).toBe(2);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "clm-1" }, data: expect.objectContaining({ suspectedDuplicateFingerprint: expect.stringMatching(/^suspect:v1:/) }) }));
  });

  it("is idempotent — nothing missing ⇒ zero updates", async () => {
    const update = vi.fn(async () => ({}));
    const db = mockDb({ claimCount: 3, missing: [], update });
    const r = await runBackfill(db, { apply: true });
    expect(r.claimsUpdated).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it("flags a SUCCEEDED receipt with no claim as an anomaly", async () => {
    const db = mockDb({ succeededOrphans: 2 });
    const r = await runBackfill(db, { apply: false });
    expect(r.anomalies.some((a) => /no linked claim/.test(a))).toBe(true);
  });
});

describe("F2.6 — policies-non-live gate", () => {
  const livePolicy = {
    id: "pol-live", mode: "LIVE", status: "APPROVED", maxAutoApproveAmount: 50000,
    requireAllLinesPriced: true, requireDocumentsComplete: true, requireEligibilityClear: true,
    requireCleanFraud: true, requirePreauthWhenNeeded: true,
    allowedSources: ["MANUAL"], allowedServiceTypes: ["OUTPATIENT"], allowedBenefitCategories: ["OUTPATIENT"],
  };
  it("lists a policy that resolves LIVE", async () => {
    const db = mockDb({ policies: [livePolicy, { ...livePolicy, id: "pol-off", mode: "OFF" }] });
    expect(await verifyPoliciesNonLive(db)).toEqual(["pol-live"]);
  });
  it("returns empty when all policies resolve OFF (post-deploy fail-safe)", async () => {
    const db = mockDb({ policies: [{ ...livePolicy, id: "p1", status: "DRAFT" }, { ...livePolicy, id: "p2", mode: "OFF" }] });
    expect(await verifyPoliciesNonLive(db)).toEqual([]);
  });
});

describe("F2.6 — safe rollback", () => {
  it("disables every non-OFF policy without touching receipts/runs", async () => {
    const updateMany = vi.fn(async () => ({ count: 4 }));
    const db = mockDb({ updateMany });
    const n = await rollbackDisableLive(db, "op-1", "rollback");
    expect(n).toBe(4);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { mode: { not: "OFF" } }, data: expect.objectContaining({ mode: "OFF", status: "DEACTIVATED" }) }));
  });
});
