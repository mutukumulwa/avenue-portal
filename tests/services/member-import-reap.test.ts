import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemberImportJobService } from "@/server/services/member-import-job.service";

/**
 * The reaper's whole claim is that it does not guess. These tests are about the
 * one decision that matters: a row left QUEUED is NOT evidence that nothing was
 * created, because the crash can land between `createMember` and `finishRow`.
 */

const STUCK_BATCH = {
  id: "b1",
  batchRef: "IMP-STUCK",
  tenantId: "t1",
  groupId: "g1",
  lane: "MEMBERS_ADMIN",
  status: "PROCESSING" as const,
  queuedAt: new Date("2026-08-14T00:00:00Z"),
  processingAt: new Date("2026-08-14T00:00:01Z"),
};

const row = (rowNumber: number, idNumber: string | null) => ({
  rowNumber,
  normalizedInput: { firstName: "Jane", lastName: "Doe", idNumber },
});

const db = {
  importBatch: { findMany: vi.fn(), update: vi.fn() },
  importRow: { findMany: vi.fn(), updateMany: vi.fn() },
  importUnit: { findMany: vi.fn(), update: vi.fn() },
  member: { findFirst: vi.fn() },
  endorsement: { findFirst: vi.fn() },
  $transaction: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  db.importBatch.findMany.mockResolvedValue([STUCK_BATCH]);
  db.importRow.updateMany.mockResolvedValue({ count: 1 });
  db.importUnit.findMany.mockResolvedValue([]);
  db.member.findFirst.mockResolvedValue(null);
  db.endorsement.findFirst.mockResolvedValue(null);
  // finalize() re-reads rows; default to a resolved batch so the reap can finish.
  db.importRow.findMany.mockResolvedValue([]);
  db.importBatch.update.mockResolvedValue({
    id: "b1", batchRef: "IMP-STUCK", status: "FAILED", acceptedCount: 0, rejects: [],
  });
});

describe("P06.02 reaper — stuck member imports", () => {
  it("recovers a row whose member WAS created before the crash", async () => {
    db.importRow.findMany
      .mockResolvedValueOnce([row(2, "CM123456")]) // the stranded rows
      .mockResolvedValue([]); // finalize's read
    db.member.findFirst.mockResolvedValue({ id: "m-real" });

    const [outcome] = await MemberImportJobService.reap(db as never);

    expect(outcome.recovered).toBe(1);
    expect(outcome.abandoned).toBe(0);
    // Recorded as ACCEPTED against the member that actually exists — this is
    // what stops the next attempt creating a duplicate.
    expect(db.importRow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ACCEPTED", resultEntityId: "m-real" }),
      }),
    );
  });

  it("only adopts records created after the batch started", async () => {
    db.importRow.findMany.mockResolvedValueOnce([row(2, "CM123456")]).mockResolvedValue([]);

    await MemberImportJobService.reap(db as never);

    // Without the createdAt floor it would happily claim a member some earlier
    // import made and report a success that never happened.
    expect(db.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          groupId: "g1",
          createdAt: { gte: STUCK_BATCH.processingAt },
        }),
      }),
    );
  });

  it("marks a row abandoned only when no record exists", async () => {
    db.importRow.findMany.mockResolvedValueOnce([row(2, "CM123456")]).mockResolvedValue([]);
    db.member.findFirst.mockResolvedValue(null);

    const [outcome] = await MemberImportJobService.reap(db as never);

    expect(outcome.abandoned).toBe(1);
    expect(outcome.recovered).toBe(0);
    expect(db.importRow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", failureCode: "ABANDONED" }),
      }),
    );
  });

  it("refuses to decide a row with no national ID, and says so", async () => {
    db.importRow.findMany.mockResolvedValueOnce([row(2, null)]).mockResolvedValue([]);

    const [outcome] = await MemberImportJobService.reap(db as never);

    expect(outcome.inconclusive).toBe(1);
    expect(db.member.findFirst).not.toHaveBeenCalled();
    expect(db.importRow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "UNKNOWN", failureCode: "REAPED_INCONCLUSIVE" }),
      }),
    );
  });

  it("reconciles the HR lane against endorsements, matching the raw id", async () => {
    db.importBatch.findMany.mockResolvedValue([{ ...STUCK_BATCH, lane: "HR_ENDORSEMENT" }]);
    db.importRow.findMany.mockResolvedValueOnce([row(2, "CM123456")]).mockResolvedValue([]);
    db.endorsement.findFirst.mockResolvedValue({ id: "e-real" });

    const [outcome] = await MemberImportJobService.reap(db as never);

    expect(outcome.recovered).toBe(1);
    expect(db.member.findFirst).not.toHaveBeenCalled();
    expect(db.endorsement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          changeDetails: { path: ["idNumber"], equals: "CM123456" },
        }),
      }),
    );
  });

  it("a dry run does every lookup and no write", async () => {
    db.importRow.findMany.mockResolvedValueOnce([row(2, "CM123456")]).mockResolvedValue([]);
    db.member.findFirst.mockResolvedValue({ id: "m-real" });

    const [outcome] = await MemberImportJobService.reap(db as never, { dryRun: true });

    expect(outcome.recovered).toBe(1); // the count is real
    expect(db.member.findFirst).toHaveBeenCalled(); // the lookup happened
    expect(db.importRow.updateMany).not.toHaveBeenCalled(); // nothing was written
    expect(db.importBatch.update).not.toHaveBeenCalled(); // finalize did not run
  });

  it("only considers batches left non-terminal past the staleness cutoff", async () => {
    const now = new Date("2026-08-14T01:00:00Z");
    await MemberImportJobService.reap(db as never, { now, staleAfterMs: 60_000 });

    const where = db.importBatch.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ["QUEUED", "PROCESSING"] });
    expect(where.OR).toEqual([
      { processingAt: { lt: new Date("2026-08-14T00:59:00Z") } },
      { processingAt: null, queuedAt: { lt: new Date("2026-08-14T00:59:00Z") } },
    ]);
  });
});
