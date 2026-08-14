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

/**
 * How long a batch may sit non-terminal before the reaper treats it as
 * abandoned. An import runs synchronously inside a server action, well inside
 * any platform request budget, so anything still QUEUED or PROCESSING after
 * this did not slow down — it stopped.
 */
export const STALE_IMPORT_AFTER_MS = 15 * 60_000;

export type ReapOutcome = {
  batchId: string;
  batchRef: string;
  lane: string;
  /** Batch status after reconciliation. UNKNOWN means a person still must look. */
  status: ImportBatchStatus;
  /** Rows that HAD created their record — the crash was after the write. */
  recovered: number;
  /** Rows with no record to find — the import stopped before reaching them. */
  abandoned: number;
  /** Rows with nothing to match on. These keep the batch UNKNOWN, deliberately. */
  inconclusive: number;
};

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

  /**
   * Resolve imports that stopped without finishing.
   *
   * ## The defect this closes
   *
   * `finishRow` throws, and `confirmImportAction` does not catch it. When it
   * fires the server action 500s with the batch left PROCESSING and `finalize`
   * never called. `reserve` then finds a non-terminal batch and refuses to
   * replay it — correctly, because nobody knows what happened — and since the
   * idempotency key is a hash of the file's content, THAT FILE CAN NEVER BE
   * SUBMITTED FOR THAT GROUP AGAIN. A crash mid-import was permanent.
   *
   * ## Why it can do better than guessing
   *
   * The obvious reaper marks abandoned rows FAILED and moves on. That is a lie
   * in the one case that matters: `createMember` can succeed and the process
   * die before `finishRow` records it, so a QUEUED row is NOT evidence that
   * nothing was created. Marking it failed would hide a real member and invite
   * a duplicate on the next attempt.
   *
   * So this reconciles against the records themselves. `Member.nationalIdNormalized`
   * is unique per tenant and `Endorsement.changeDetails` carries the row's raw
   * `idNumber`, so for any row that HAS a national ID the question "did this row
   * create its record" has an exact answer, not a heuristic one. Constraining
   * the search to records created after the batch started keeps it from
   * adopting a member some earlier import made.
   *
   * A row with no national ID has nothing to match on. Those are marked UNKNOWN
   * rather than guessed at, which keeps the whole batch UNKNOWN — still blocked,
   * now visibly and with a reason, which is the honest outcome. Everything else
   * finalizes to a truthful SUCCEEDED / PARTIAL / FAILED, and a truthful
   * terminal status is what lets `reserve` replay the recorded result instead
   * of refusing forever.
   *
   * Provenance lives on the ROWS (`failureCode` ABANDONED / REAPED_INCONCLUSIVE).
   * `finalize` stays authoritative at batch level rather than being second-
   * guessed here, so there is one place that decides what a batch's status means.
   */
  static async reap(
    db: PrismaClient,
    opts: { staleAfterMs?: number; now?: Date; limit?: number; dryRun?: boolean } = {},
  ): Promise<ReapOutcome[]> {
    const now = opts.now ?? new Date();
    const cutoff = new Date(now.getTime() - (opts.staleAfterMs ?? STALE_IMPORT_AFTER_MS));

    const batches = await db.importBatch.findMany({
      where: {
        status: { in: ["QUEUED", "PROCESSING"] },
        // PROCESSING is timed from when it was claimed; a batch that never got
        // claimed at all is timed from when it was queued.
        OR: [{ processingAt: { lt: cutoff } }, { processingAt: null, queuedAt: { lt: cutoff } }],
      },
      select: {
        id: true, batchRef: true, tenantId: true, groupId: true, lane: true,
        status: true, queuedAt: true, processingAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: opts.limit ?? 25,
    });

    const outcomes: ReapOutcome[] = [];
    for (const batch of batches) {
      outcomes.push(await this.reapBatch(db, batch, opts.dryRun === true));
    }
    return outcomes;
  }

  private static async reapBatch(
    db: PrismaClient,
    batch: {
      id: string; batchRef: string; tenantId: string; groupId: string; lane: string;
      status?: ImportBatchStatus;
      queuedAt: Date | null; processingAt: Date | null;
    },
    dryRun: boolean,
  ): Promise<ReapOutcome> {
    const rows = await db.importRow.findMany({
      where: { batchId: batch.id, status: { in: ["QUEUED", "PROCESSING"] } },
      select: { rowNumber: true, normalizedInput: true },
    });

    // Nothing this batch created can predate its own start.
    const since = batch.processingAt ?? batch.queuedAt ?? null;

    let recovered = 0;
    let abandoned = 0;
    let inconclusive = 0;

    for (const row of rows) {
      const input = (row.normalizedInput ?? {}) as Record<string, unknown>;
      const idNumber = typeof input.idNumber === "string" ? input.idNumber.trim() : "";

      if (!idNumber) {
        if (!dryRun) {
          await db.importRow.updateMany({
            where: { batchId: batch.id, rowNumber: row.rowNumber, status: { in: ["QUEUED", "PROCESSING"] } },
            data: {
              status: "UNKNOWN",
              failureCode: "REAPED_INCONCLUSIVE",
              failureMessage:
                "The import stopped before this row reached a result, and the row carries no national ID " +
                "to check against. Whether its record was created cannot be determined automatically.",
              terminalAt: new Date(),
            },
          });
        }
        inconclusive += 1;
        continue;
      }

      const found = batch.lane === "HR_ENDORSEMENT"
        ? await this.findEndorsementFor(db, batch, idNumber, since)
        : await this.findMemberFor(db, batch, idNumber, since);

      if (found) {
        if (!dryRun) {
          await this.finishRow(db, batch.id, row.rowNumber, {
            status: "ACCEPTED", entityType: found.entityType, entityId: found.id,
          });
        }
        recovered += 1;
      } else {
        if (!dryRun) {
          await this.finishRow(db, batch.id, row.rowNumber, {
            status: "FAILED",
            code: "ABANDONED",
            message:
              "The import stopped before this row was processed, and no matching record exists. " +
              "Nothing was created for it.",
          });
        }
        abandoned += 1;
      }
    }

    // A dry run does every lookup and no write, so the counts above are real.
    // The status is not: it is what the batch is NOW, because only `finalize`
    // decides what it becomes and running it would be the write we are avoiding.
    if (dryRun) {
      return {
        batchId: batch.id,
        batchRef: batch.batchRef,
        lane: batch.lane,
        status: batch.status ?? "PROCESSING",
        recovered,
        abandoned,
        inconclusive,
      };
    }

    const snapshotAfter = await this.finalize(db, batch.id);
    return {
      batchId: batch.id,
      batchRef: snapshotAfter.batchRef,
      lane: batch.lane,
      status: snapshotAfter.status,
      recovered,
      abandoned,
      inconclusive,
    };
  }

  private static async findMemberFor(
    db: PrismaClient,
    batch: { tenantId: string; groupId: string },
    idNumber: string,
    since: Date | null,
  ): Promise<{ entityType: string; id: string } | null> {
    const normalized = normalizeNationalId(idNumber);
    if (!normalized) return null;

    const member = await db.member.findFirst({
      where: {
        tenantId: batch.tenantId,
        groupId: batch.groupId,
        nationalIdNormalized: normalized,
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: { id: true },
    });
    return member ? { entityType: "MEMBER", id: member.id } : null;
  }

  private static async findEndorsementFor(
    db: PrismaClient,
    batch: { tenantId: string; groupId: string },
    idNumber: string,
    since: Date | null,
  ): Promise<{ entityType: string; id: string } | null> {
    // `changeDetails` stores the row's idNumber verbatim (see the HR lane's
    // confirm action), so this matches raw rather than normalized.
    const endorsement = await db.endorsement.findFirst({
      where: {
        tenantId: batch.tenantId,
        groupId: batch.groupId,
        changeDetails: { path: ["idNumber"], equals: idNumber },
        ...(since ? { requestedDate: { gte: since } } : {}),
      },
      select: { id: true },
    });
    return endorsement ? { entityType: "ENDORSEMENT", id: endorsement.id } : null;
  }
}
