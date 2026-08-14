import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { MemberImportJobService } from "@/server/services/member-import-job.service";

const row = (overrides: Record<string, unknown> = {}) => ({
  row: 2, firstName: "Jane", lastName: "Doe", idNumber: "P1",
  dateOfBirth: "1990-01-01", gender: "FEMALE", phone: "", email: "",
  relationship: "PRINCIPAL", principalIdNumber: "", sourceReference: "", ...overrides,
});

const db = {
  importBatch: {
    findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(),
    updateMany: vi.fn(), update: vi.fn(),
  },
  importUnit: { createMany: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  importRow: { createMany: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn) => fn(db));
  db.importBatch.findUnique.mockResolvedValue(null);
  db.importBatch.create.mockResolvedValue({
    id: "b1", batchRef: "IMP-ONE", status: "QUEUED", acceptedCount: 0, rejects: [],
  });
  db.importUnit.createMany.mockResolvedValue({ count: 1 });
  db.importRow.createMany.mockResolvedValue({ count: 1 });
  db.importRow.updateMany.mockResolvedValue({ count: 1 });
});

describe("P06.02 durable member-import job ledger", () => {
  it("reserves the batch, family units and every row in one transaction", async () => {
    const result = await MemberImportJobService.reserve(db as never, {
      tenantId: "t1", groupId: "g1", lane: "MEMBERS_ADMIN", idempotencyKey: "key",
      fileName: "members.csv", createdBy: "u1",
      rows: [
        row(),
        row({ row: 3, idNumber: "D1", relationship: "CHILD", principalIdNumber: "P1" }),
        row({ row: 4, idNumber: "BAD", error: "Rejected before commit" }),
      ],
    });
    expect(result.created).toBe(true);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.importUnit.createMany.mock.calls[0][0].data).toHaveLength(1);
    const rows = db.importRow.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(3);
    expect(rows.map((item: { status: string }) => item.status)).toEqual(["QUEUED", "QUEUED", "REJECTED"]);
    expect(rows[0].unitId).toBe(rows[1].unitId);
    expect(rows[2].unitId).toBeNull();
  });

  it("does not call a queued or processing reservation a completed replay", async () => {
    db.importBatch.findUnique.mockResolvedValue({
      id: "b1", batchRef: "IMP-LIVE", status: "PROCESSING", acceptedCount: 0, rejects: [],
    });
    const result = await MemberImportJobService.reserve(db as never, {
      tenantId: "t1", groupId: "g1", lane: "MEMBERS_ADMIN", idempotencyKey: "key",
      fileName: null, createdBy: "u1", rows: [row()],
    });
    expect(result).toMatchObject({ created: false, job: { status: "PROCESSING", terminal: false } });
    expect(db.importBatch.create).not.toHaveBeenCalled();
  });

  it("claims only a queued batch with one conditional update", async () => {
    db.importBatch.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(MemberImportJobService.claim(db as never, "b1")).resolves.toBe(true);
    await expect(MemberImportJobService.claim(db as never, "b1")).resolves.toBe(false);
    expect(db.importBatch.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "b1", status: "QUEUED" },
    }));
  });

  it("fails closed when a row is no longer processable", async () => {
    db.importRow.updateMany.mockResolvedValue({ count: 0 });
    await expect(MemberImportJobService.finishRow(db as never, "b1", 2, {
      status: "ACCEPTED", entityType: "MEMBER", entityId: "m1",
    })).rejects.toThrow(/outcome remains unresolved/i);
  });

  it("derives terminal batch counts and PARTIAL status solely from row outcomes", async () => {
    db.importRow.findMany.mockResolvedValue([
        { rowNumber: 2, recordCount: 1, normalizedInput: { firstName: "A", lastName: "One" }, status: "ACCEPTED", preflightError: null, failureMessage: null },
        { rowNumber: 3, recordCount: 1, normalizedInput: { firstName: "B", lastName: "Two" }, status: "REJECTED", preflightError: "bad row", failureMessage: "bad row" },
      ]);
    db.importUnit.findMany.mockResolvedValue([{ id: "u1", rows: [{ status: "ACCEPTED" }, { status: "REJECTED" }] }]);
    db.importUnit.update.mockResolvedValue({});
    db.importBatch.update.mockResolvedValue({
      id: "b1", batchRef: "IMP-ONE", status: "PARTIAL", acceptedCount: 1,
      rejects: [{ row: 3, name: "B Two", error: "bad row" }],
    });
    const result = await MemberImportJobService.finalize(db as never, "b1");
    expect(db.importBatch.update.mock.calls[0][0].data).toMatchObject({
      status: "PARTIAL", acceptedCount: 1, rejectedCount: 1, failedCount: 1,
      failureCode: null, failureMessage: null,
    });
    expect(result).toMatchObject({ status: "PARTIAL", imported: 1, terminal: true });
  });

  it("marks a batch UNKNOWN when even one row lacks a terminal result", async () => {
    db.importRow.findMany.mockResolvedValue([
      { rowNumber: 2, recordCount: 1, normalizedInput: { firstName: "A", lastName: "One" }, status: "PROCESSING", preflightError: null, failureMessage: null },
    ]);
    db.importUnit.findMany.mockResolvedValue([{ id: "u1", rows: [{ status: "PROCESSING" }] }]);
    db.importUnit.update.mockResolvedValue({});
    db.importBatch.update.mockResolvedValue({
      id: "b1", batchRef: "IMP-ONE", status: "UNKNOWN", acceptedCount: 0, rejects: [],
    });
    await MemberImportJobService.finalize(db as never, "b1");
    expect(db.importBatch.update.mock.calls[0][0].data).toMatchObject({
      status: "UNKNOWN", failureCode: "NONTERMINAL_ROWS_REMAIN", completedAt: null,
    });
    expect(db.importUnit.update.mock.calls[0][0].data).toMatchObject({
      status: "UNKNOWN", failureCode: "NONTERMINAL_ROWS_REMAIN", completedAt: null,
    });
  });

  it("records an explicit batch failure when no row was accepted", async () => {
    db.importRow.findMany.mockResolvedValue([
      { rowNumber: 2, recordCount: 1, normalizedInput: { firstName: "Bad", lastName: "Row" }, status: "REJECTED", preflightError: "invalid", failureMessage: "invalid" },
    ]);
    db.importUnit.findMany.mockResolvedValue([]);
    db.importBatch.update.mockResolvedValue({
      id: "b1", batchRef: "IMP-ONE", status: "FAILED", acceptedCount: 0,
      rejects: [{ row: 2, name: "Bad Row", error: "invalid" }],
    });
    await MemberImportJobService.finalize(db as never, "b1");
    expect(db.importBatch.update.mock.calls[0][0].data).toMatchObject({
      status: "FAILED",
      failureCode: "NO_ROWS_ACCEPTED",
      failureMessage: "No import rows were accepted.",
    });
  });

  it("backfills ambiguous legacy reservations to UNKNOWN and preserves aggregate counts", () => {
    const sql = readFileSync(
      "prisma/migrations/20260813001400_durable_import_ledger/migration.sql",
      "utf8",
    );
    expect(sql).toMatch(/ELSE 'UNKNOWN'::"ImportBatchStatus"/);
    expect(sql).toContain("LEGACY_OUTCOME_UNKNOWN");
    expect(sql).toMatch(/'legacy-accepted-'[\s\S]*"importedCount"/);
    expect(sql).toMatch(/'legacy-failed-'[\s\S]*"failedCount"/);
    expect(sql).toContain("LEGACY_AGGREGATE_FAILURE");
    expect(sql).toContain('"recordCount"');
  });
});
