/**
 * UAT-HF P02.03 — governed repair of a contract date the UI cannot render.
 *
 * DEF-050, verbatim: "The record cannot be reached to be fixed:
 * /contracts/{id}/edit returns 'Page Not Found', so there is no UI action that
 * can void, delete or correct the offending row. The module is dead until
 * someone changes code or edits the database directly." It was ultimately fixed
 * by deleting the row against the database, out of band.
 *
 * Acceptance: "correction preserves history and dependent applicability/tariffs;
 * stale repair is rejected; audit shows old/new/reason/checker."
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  providerContract: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    updateMany: vi.fn(async (_a: MockDbArgs) => ({ count: 1 })),
    update: vi.fn(async (a: MockDbArgs) => ({ id: a.where!.id })),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  overrideRecord: {
    findFirst: vi.fn(async (): Promise<MockDbRow | null> => null),
    update: vi.fn(async (_a: MockDbArgs) => ({})),
  },
  providerTariff: { deleteMany: vi.fn() },
  contractApplicability: { deleteMany: vi.fn() },
  $transaction: vi.fn(async (_fn: (tx: unknown) => unknown): Promise<unknown> => undefined),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const audit = vi.hoisted(() => ({ append: vi.fn(async () => ({})) }));
vi.mock("@/server/services/audit-chain.service", () => ({ auditChainService: audit }));

const events = vi.hoisted(() => ({ record: vi.fn(async (_a: MockDbRow, _tx?: unknown) => ({ id: "evt1" })) }));
vi.mock("@/server/services/domain-event.service", () => ({ DomainEventService: events }));

const overrides = vi.hoisted(() => ({ request: vi.fn(async (_a: MockDbRow) => ({ id: "ov1" })) }));
vi.mock("@/server/services/override.service", () => ({
  overrideService: overrides,
  OVERRIDE_APPROVER_ROLES: {},
}));

import { ContractLifecycleService } from "@/server/services/contract-lifecycle.service";

const T = "t1";
const UPDATED_AT = new Date("2026-08-12T06:52:33.145Z");

/** A contract carrying the run's actual damaged dates. */
const damaged = (over: Record<string, unknown> = {}) => ({
  id: "pc1",
  tenantId: T,
  contractNumber: "PC-2026-202",
  status: "DRAFT",
  startDate: new Date(Date.UTC(60901, 1, 20)),
  endDate: new Date(Date.UTC(70831, 1, 20)),
  reviewDueDate: null,
  updatedAt: UPDATED_AT,
  ...over,
});

const GOOD = {
  startDate: "2026-08-12",
  endDate: "2027-08-11",
  justification: "Year typed with an extra digit on creation; corrected from the signed agreement.",
  sourceDocumentRef: "PC-2026-202 rev B (DMS)",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.providerContract.findUnique.mockResolvedValue(damaged());
  db.providerContract.findUniqueOrThrow.mockResolvedValue(damaged({ startDate: new Date("2026-08-12") }));
  db.providerContract.updateMany.mockResolvedValue({ count: 1 });
  db.overrideRecord.findFirst.mockResolvedValue(null);
  // Run the transaction body against the same mock client.
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
});

describe("P02.03 requestDateRepair — propose, write nothing", () => {
  it("creates a governed proposal and does NOT touch the contract", async () => {
    const result = await ContractLifecycleService.requestDateRepair(T, "pc1", "maker-1", GOOD);

    expect(result.overrideId).toBe("ov1");
    expect(overrides.request).toHaveBeenCalledTimes(1);
    // Nothing is written to the contract until a checker approves.
    expect(db.providerContract.updateMany).not.toHaveBeenCalled();
    expect(db.providerContract.update).not.toHaveBeenCalled();
  });

  it("records before, proposed, the source document and a concurrency token", async () => {
    await ContractLifecycleService.requestDateRepair(T, "pc1", "maker-1", GOOD);

    const arg = overrides.request.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.overrideType).toBe("CONTRACT_DATE_REPAIR");
    expect(arg.reasonCode).toBe("SYSTEM_ERROR_CORRECTION");
    const pre = arg.preState as Record<string, Record<string, unknown> | string>;
    // The damaged values must survive being recorded — that is the point.
    expect(pre.before).toEqual({ startDate: "unrenderable", endDate: "unrenderable", reviewDueDate: null });
    expect(pre.proposed).toMatchObject({ startDate: "2026-08-12", endDate: "2027-08-11" });
    expect(pre.sourceDocumentRef).toBe("PC-2026-202 rev B (DMS)");
    expect(pre.contractUpdatedAt).toBe(UPDATED_AT.toISOString());
  });

  it("refuses a proposal that is itself unrenderable", async () => {
    // A repair that stores another five-digit year helps nobody.
    await expect(
      ContractLifecycleService.requestDateRepair(T, "pc1", "maker-1", { ...GOOD, endDate: "70831-02-20" }),
    ).rejects.toThrow(/between 1900-01-01 and 9999-12-31/);
    expect(overrides.request).not.toHaveBeenCalled();
  });

  it("refuses an inverted proposed term", async () => {
    await expect(
      ContractLifecycleService.requestDateRepair(T, "pc1", "maker-1", {
        ...GOOD,
        startDate: "2027-01-01",
        endDate: "2026-01-01",
      }),
    ).rejects.toThrow(/on or after the start date/i);
  });

  it("requires a real reason and a source document", async () => {
    await expect(
      ContractLifecycleService.requestDateRepair(T, "pc1", "maker-1", { ...GOOD, justification: "typo" }),
    ).rejects.toThrow(/at least 10 characters/);
    await expect(
      ContractLifecycleService.requestDateRepair(T, "pc1", "maker-1", { ...GOOD, sourceDocumentRef: "  " }),
    ).rejects.toThrow(/source document/i);
    expect(overrides.request).not.toHaveBeenCalled();
  });
});

describe("P02.03 applyApprovedDateRepair", () => {
  const approved = (over: Record<string, unknown> = {}) => ({
    id: "ov1",
    makerId: "maker-1",
    checkerId: "checker-9",
    reasonCode: "SYSTEM_ERROR_CORRECTION",
    justification: "Corrected from the signed agreement.",
    postState: null,
    preState: {
      before: { startDate: "unrenderable", endDate: "unrenderable", reviewDueDate: null },
      proposed: { startDate: "2026-08-12", endDate: "2027-08-11", reviewDueDate: null },
      sourceDocumentRef: "PC-2026-202 rev B (DMS)",
      contractUpdatedAt: UPDATED_AT.toISOString(),
    },
    ...over,
  });

  it("refuses to apply anything without an approval", async () => {
    db.overrideRecord.findFirst.mockResolvedValue(null);
    await expect(ContractLifecycleService.applyApprovedDateRepair(T, "pc1", "maker-1")).rejects.toThrow(
      /has not been approved/i,
    );
    expect(db.providerContract.updateMany).not.toHaveBeenCalled();
  });

  it("REJECTS a stale repair — the contract changed after the proposal", async () => {
    db.overrideRecord.findFirst.mockResolvedValue(approved());
    db.providerContract.findUnique.mockResolvedValue(damaged({ updatedAt: new Date("2026-08-13T00:00:00.000Z") }));

    await expect(ContractLifecycleService.applyApprovedDateRepair(T, "pc1", "maker-1")).rejects.toThrow(
      /changed after the repair was proposed/i,
    );
    // The approver did not approve THIS state, so nothing is written.
    expect(db.providerContract.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to replay an already-applied repair", async () => {
    db.overrideRecord.findFirst.mockResolvedValue(
      approved({ postState: { appliedAt: "2026-08-12T07:00:00.000Z" } }),
    );
    await expect(ContractLifecycleService.applyApprovedDateRepair(T, "pc1", "maker-1")).rejects.toThrow(
      /already been applied/i,
    );
    expect(db.providerContract.updateMany).not.toHaveBeenCalled();
  });

  it("applies the correction, conditional on the contract not having moved", async () => {
    db.overrideRecord.findFirst.mockResolvedValue(approved());
    await ContractLifecycleService.applyApprovedDateRepair(T, "pc1", "maker-1");

    expect(db.providerContract.updateMany).toHaveBeenCalledTimes(1);
    const call = db.providerContract.updateMany.mock.calls[0][0] as MockDbArgs;
    // Optimistic concurrency: a write that slipped in loses, it does not win.
    expect(call.where).toMatchObject({ id: "pc1", tenantId: T, updatedAt: UPDATED_AT });
    const data = call.data as Record<string, Date>;
    expect(data.startDate.toISOString()).toBe("2026-08-12T00:00:00.000Z");
    expect(data.endDate.toISOString()).toBe("2027-08-11T00:00:00.000Z");
  });

  it("NEVER deletes the contract or its dependents", async () => {
    db.overrideRecord.findFirst.mockResolvedValue(approved());
    await ContractLifecycleService.applyApprovedDateRepair(T, "pc1", "maker-1");

    // The run's row was fixed by DELETING it out of band. This is the opposite.
    expect(db.providerContract.delete).not.toHaveBeenCalled();
    expect(db.providerContract.deleteMany).not.toHaveBeenCalled();
    expect(db.providerTariff.deleteMany).not.toHaveBeenCalled();
    expect(db.contractApplicability.deleteMany).not.toHaveBeenCalled();
  });

  it("loses the race rather than overwriting a concurrent change", async () => {
    db.overrideRecord.findFirst.mockResolvedValue(approved());
    db.providerContract.updateMany.mockResolvedValue({ count: 0 });
    await expect(ContractLifecycleService.applyApprovedDateRepair(T, "pc1", "maker-1")).rejects.toThrow(
      /changed while the repair was being applied/i,
    );
  });

  it("records an immutable event carrying old, new, reason and checker", async () => {
    db.overrideRecord.findFirst.mockResolvedValue(approved());
    await ContractLifecycleService.applyApprovedDateRepair(T, "pc1", "maker-1");

    expect(events.record).toHaveBeenCalledTimes(1);
    const event = events.record.mock.calls[0][0] as Record<string, unknown>;
    expect(event.eventType).toBe("contract.dates.repaired");
    expect(event.entityRef).toBe("PC-2026-202");
    expect(event.reasonNote).toBe("Corrected from the signed agreement.");
    const payload = event.payload as Record<string, unknown>;
    expect(payload.before).toMatchObject({ startDate: "unrenderable" });
    expect(payload.after).toMatchObject({ startDate: "2026-08-12" });
    expect(payload.sourceDocumentRef).toBe("PC-2026-202 rev B (DMS)");
    // The audit must name WHO approved it, not only who applied it.
    expect(payload.checkerId).toBe("checker-9");
    expect(payload.makerId).toBe("maker-1");
  });

  it("marks the approval consumed so it cannot authorise a second edit", async () => {
    db.overrideRecord.findFirst.mockResolvedValue(approved());
    await ContractLifecycleService.applyApprovedDateRepair(T, "pc1", "maker-1");

    const call = db.overrideRecord.update.mock.calls[0][0] as MockDbArgs;
    expect(call.where).toMatchObject({ id: "ov1" });
    expect((call.data as { postState: { appliedAt: string } }).postState.appliedAt).toBeTruthy();
  });

  it("also writes the contract audit-chain entry", async () => {
    db.overrideRecord.findFirst.mockResolvedValue(approved());
    await ContractLifecycleService.applyApprovedDateRepair(T, "pc1", "maker-1");
    expect(audit.append).toHaveBeenCalledTimes(1);
  });
});
