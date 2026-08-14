import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  ImportBatchStatus,
  ImportRowStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { normalizeNationalId } from "@/lib/normalize";
import {
  canonicalMemberImportContent,
  type MemberImportLane,
  type MemberImportRow,
} from "@/server/services/member-import-preflight.service";

type Db = PrismaClient | Prisma.TransactionClient;

const TERMINAL_BATCH = new Set<ImportBatchStatus>([
  "SUCCEEDED", "PARTIAL", "FAILED", "UNKNOWN",
]);

export type ImportReject = { row: number; name: string; error: string };

export type ImportJobSnapshot = {
  id: string;
  batchRef: string;
  status: ImportBatchStatus;
  imported: number;
  failed: ImportReject[];
  terminal: boolean;
};

function batchReference(): string {
  return `IMP-${randomBytes(9).toString("base64url").toUpperCase()}`;
}

function unitKey(row: MemberImportRow): string {
  const family = row.relationship === "PRINCIPAL"
    ? row.idNumber || `ROW-${row.row}`
    : row.principalIdNumber || `ROW-${row.row}`;
  return createHash("sha256").update(normalizeNationalId(family)).digest("hex");
}

function rowJson(row: MemberImportRow): Prisma.InputJsonObject {
  return {
    row: row.row,
    firstName: row.firstName,
    lastName: row.lastName,
    idNumber: row.idNumber,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender,
    phone: row.phone,
    email: row.email,
    relationship: row.relationship,
    principalIdNumber: row.principalIdNumber,
    sourceReference: row.sourceReference,
  };
}

function snapshot(batch: {
  id: string;
  batchRef: string;
  status: ImportBatchStatus;
  acceptedCount: number;
  rejects: unknown;
}): ImportJobSnapshot {
  return {
    id: batch.id,
    batchRef: batch.batchRef,
    status: batch.status,
    imported: batch.acceptedCount,
    failed: Array.isArray(batch.rejects) ? batch.rejects as ImportReject[] : [],
    terminal: TERMINAL_BATCH.has(batch.status),
  };
}

export class MemberImportJobService {
  static async reserve(
    db: PrismaClient,
    input: {
      tenantId: string;
      groupId: string;
      lane: MemberImportLane;
      idempotencyKey: string;
      fileName: string | null;
      createdBy: string;
      rows: MemberImportRow[];
    },
  ): Promise<{ created: boolean; job: ImportJobSnapshot }> {
    const existing = await db.importBatch.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
      select: { id: true, batchRef: true, status: true, acceptedCount: true, rejects: true },
    });
    if (existing) return { created: false, job: snapshot(existing) };

    try {
      return await db.$transaction(async (tx) => {
        const now = new Date();
        const units = new Map<string, { id: string; principalKey: string | null }>();
        for (const row of input.rows.filter((item) => !item.error)) {
          const key = unitKey(row);
          if (!units.has(key)) {
            units.set(key, {
              id: randomUUID(),
              principalKey: row.relationship === "PRINCIPAL"
                ? row.idNumber || null
                : row.principalIdNumber || null,
            });
          }
        }
        const batch = await tx.importBatch.create({
          data: {
            batchRef: batchReference(),
            tenantId: input.tenantId,
            groupId: input.groupId,
            lane: input.lane,
            idempotencyKey: input.idempotencyKey,
            sourceHash: createHash("sha256")
              .update(canonicalMemberImportContent(input.rows, input.lane))
              .digest("hex"),
            status: "QUEUED",
            fileName: input.fileName,
            totalRows: input.rows.length,
            rejectedCount: input.rows.filter((row) => row.error).length,
            failedCount: input.rows.filter((row) => row.error).length,
            rejects: input.rows.filter((row) => row.error).map((row) => ({
              row: row.row,
              name: `${row.firstName} ${row.lastName}`.trim(),
              error: row.error!,
            })) as unknown as Prisma.InputJsonValue,
            createdBy: input.createdBy,
            preflightedAt: now,
            queuedAt: now,
          },
          select: { id: true, batchRef: true, status: true, acceptedCount: true, rejects: true },
        });
        if (units.size > 0) {
          await tx.importUnit.createMany({
            data: [...units.entries()].map(([key, unit]) => ({
              id: unit.id,
              batchId: batch.id,
              unitKey: key,
              principalKey: unit.principalKey,
            })),
          });
        }
        await tx.importRow.createMany({
          data: input.rows.map((row) => ({
            id: randomUUID(),
            batchId: batch.id,
            unitId: row.error ? null : units.get(unitKey(row))!.id,
            rowNumber: row.row,
            sourceInput: rowJson(row),
            normalizedInput: rowJson(row),
            preflightError: row.error ?? null,
            preflightWarnings: (row.warnings ?? []) as Prisma.InputJsonValue,
            status: row.error ? "REJECTED" : "QUEUED",
            failureCode: row.error ? "PREFLIGHT_REJECTED" : null,
            failureMessage: row.error ?? null,
            terminalAt: row.error ? now : null,
          })),
        });
        return { created: true, job: snapshot(batch) };
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const winner = await db.importBatch.findUniqueOrThrow({
        where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
        select: { id: true, batchRef: true, status: true, acceptedCount: true, rejects: true },
      });
      return { created: false, job: snapshot(winner) };
    }
  }

  static async claim(db: Db, batchId: string): Promise<boolean> {
    const result = await db.importBatch.updateMany({
      where: { id: batchId, status: "QUEUED" },
      data: { status: "PROCESSING", processingAt: new Date() },
    });
    return result.count === 1;
  }

  static async finishRow(
    db: Db,
    batchId: string,
    rowNumber: number,
    input: {
      status: Extract<ImportRowStatus, "ACCEPTED" | "FAILED" | "CONFLICT">;
      entityType?: string;
      entityId?: string;
      code?: string;
      message?: string;
    },
  ): Promise<void> {
    const result = await db.importRow.updateMany({
      where: { batchId, rowNumber, status: { in: ["QUEUED", "PROCESSING"] } },
      data: {
        status: input.status,
        resultEntityType: input.entityType,
        resultEntityId: input.entityId,
        failureCode: input.code,
        failureMessage: input.message,
        terminalAt: new Date(),
      },
    });
    if (result.count !== 1) {
      throw new Error(
        `Import row ${rowNumber} in batch ${batchId} was not in a processable state; the batch outcome remains unresolved.`,
      );
    }
  }

  static async finalize(db: PrismaClient, batchId: string): Promise<ImportJobSnapshot> {
    return db.$transaction(async (tx) => {
      const rows = await tx.importRow.findMany({
        where: { batchId },
        select: { rowNumber: true, recordCount: true, normalizedInput: true, status: true, preflightError: true, failureMessage: true },
      });
      const count = (status: ImportRowStatus) => rows.filter((row) => row.status === status)
        .reduce((total, row) => total + row.recordCount, 0);
      const accepted = count("ACCEPTED");
      const rejected = count("REJECTED");
      const conflict = count("CONFLICT");
      const runtimeFailed = count("FAILED");
      const nonterminal = rows.filter((row) => ["QUEUED", "PROCESSING", "UNKNOWN"].includes(row.status))
        .reduce((total, row) => total + row.recordCount, 0);
      const failedRows = rows.filter((row) => ["REJECTED", "FAILED", "CONFLICT"].includes(row.status));
      const rejects: ImportReject[] = failedRows.map((row) => {
        const value = row.normalizedInput as Record<string, unknown>;
        return {
          row: row.rowNumber,
          name: `${String(value.firstName ?? "")} ${String(value.lastName ?? "")}`.trim(),
          error: row.failureMessage ?? row.preflightError ?? "The row was not accepted.",
        };
      });
      const status: ImportBatchStatus = nonterminal > 0
        ? "UNKNOWN"
        : accepted > 0 && failedRows.length > 0
          ? "PARTIAL"
          : accepted > 0
            ? "SUCCEEDED"
            : "FAILED";
      const batchFailure = nonterminal > 0
        ? {
            code: "NONTERMINAL_ROWS_REMAIN",
            message: "Some import rows have no terminal result.",
          }
        : status === "FAILED"
          ? {
              code: "NO_ROWS_ACCEPTED",
              message: "No import rows were accepted.",
            }
          : { code: null, message: null };

      const units = await tx.importUnit.findMany({
        where: { batchId },
        select: { id: true, rows: { select: { status: true } } },
      });
      for (const unit of units) {
        const unitStatus = unit.rows.length === 0 || unit.rows.some((row) => ["QUEUED", "PROCESSING", "UNKNOWN"].includes(row.status))
          ? "UNKNOWN"
          : unit.rows.every((row) => row.status === "ACCEPTED")
            ? "SUCCEEDED"
            : unit.rows.some((row) => row.status === "CONFLICT") ? "CONFLICT" : "FAILED";
        await tx.importUnit.update({
          where: { id: unit.id },
          data: {
            status: unitStatus,
            completedAt: unitStatus === "UNKNOWN" ? null : new Date(),
            failureCode: unitStatus === "UNKNOWN" ? "NONTERMINAL_ROWS_REMAIN" : null,
            failureMessage: unitStatus === "UNKNOWN" ? "This family unit has no terminal result." : null,
          },
        });
      }
      const batch = await tx.importBatch.update({
        where: { id: batchId },
        data: {
          status,
          importedCount: accepted,
          acceptedCount: accepted,
          rejectedCount: rejected,
          conflictCount: conflict,
          failedCount: rejected + conflict + runtimeFailed,
          rejects: rejects as unknown as Prisma.InputJsonValue,
          completedAt: nonterminal > 0 ? null : new Date(),
          failureCode: batchFailure.code,
          failureMessage: batchFailure.message,
        },
        select: { id: true, batchRef: true, status: true, acceptedCount: true, rejects: true },
      });
      return snapshot(batch);
    });
  }
}
