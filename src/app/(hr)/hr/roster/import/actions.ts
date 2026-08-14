"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { createHash } from "crypto";
import Papa from "papaparse";
import type { Gender, MemberRelationship } from "@prisma/client";
import { peekNextDocumentNumber, maxByNumericSuffix } from "@/lib/document-number";
import {
  canonicalMemberImportContent,
  createMemberImportPreviewToken,
  memberImportHeaderNotes,
  preflightMemberImport,
  todayMemberImportEffectiveDate,
  verifyMemberImportPreviewToken,
  type MemberImportRow,
} from "@/server/services/member-import-preflight.service";
import { calendarDateFromUtcDate, parseCalendarDate } from "@/lib/calendar-date";
import { MemberImportJobService } from "@/server/services/member-import-job.service";

export type ParsedRow = MemberImportRow;

export type ParseResult = {
  rows: ParsedRow[];
  validCount: number;
  errorCount: number;
  notes?: string[];
  fileName?: string;
  preflightToken?: string;
  preflightDate?: string;
  error?: string;
};

function isP2002(e: unknown): boolean {
  return (e as { code?: string })?.code === "P2002";
}

export async function parseHRImportAction(
  _prev: ParseResult | null,
  formData: FormData
): Promise<ParseResult> {
  const session = await requireRole(ROLES.HR);

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { rows: [], validCount: 0, errorCount: 0, error: "No file uploaded." };
  }

  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  const looksCsv =
    name.endsWith(".csv") || name.endsWith(".txt") ||
    type.includes("csv") || type.includes("text") || type === "" || type === "application/vnd.ms-excel";
  if (!looksCsv) {
    return { rows: [], validCount: 0, errorCount: 0, error: "Unsupported file type. Upload a .csv file with a header row." };
  }

  let data: Record<string, unknown>[];
  let fields: string[] | undefined;
  let parseErrorCount = 0;
  try {
    const text = await file.text();
    if (/\u0000/.test(text)) {
      return { rows: [], validCount: 0, errorCount: 0, error: "The file does not look like a text CSV. Upload a valid comma-separated file." };
    }
    const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
    data = parsed.data ?? [];
    fields = parsed.meta?.fields;
    parseErrorCount = parsed.errors?.length ?? 0;
  } catch {
    return { rows: [], validCount: 0, errorCount: 0, error: "Could not read the CSV file. Make sure it is a valid comma-separated file with a header row." };
  }

  if (parseErrorCount > 0) {
    return { rows: [], validCount: 0, errorCount: 0, error: "Could not parse every CSV row safely. Correct the file structure and upload it again; no partial preview was accepted." };
  }

  const hasExamples = data.some((row) =>
    String(row["isExample"] ?? (row as Record<string, unknown>)["isexample"] ?? "").toLowerCase().trim() === "true"
  );
  if (hasExamples) {
    return {
      rows: [], validCount: 0, errorCount: 0,
      error: "Example rows detected. Please delete all rows where the isExample column is \"true\" before uploading.",
    };
  }

  if (data.length === 0) {
    return { rows: [], validCount: 0, errorCount: 0, error: "The file has no data rows." };
  }

  const groupId = session.user.groupId;
  if (!groupId) {
    return { rows: [], validCount: 0, errorCount: 0, error: "No corporate group associated with your account." };
  }
  const effectiveDate = todayMemberImportEffectiveDate();
  const preflightDate = calendarDateFromUtcDate(effectiveDate)!;
  const preflight = await preflightMemberImport({
    db: prisma,
    tenantId: session.user.tenantId,
    groupId,
    lane: "HR_ENDORSEMENT",
    rawRows: data,
    effectiveDate,
  });
  if (preflight.error) {
    return { rows: [], validCount: 0, errorCount: 0, error: preflight.error };
  }
  const notes = memberImportHeaderNotes(fields, "HR_ENDORSEMENT");

  return {
    rows: preflight.rows,
    validCount: preflight.validCount,
    errorCount: preflight.errorCount,
    notes: notes.length ? notes : undefined,
    fileName: file.name || undefined,
    preflightDate,
    preflightToken: createMemberImportPreviewToken({
      lane: "HR_ENDORSEMENT",
      tenantId: session.user.tenantId,
      groupId,
      effectiveDate: preflightDate,
      rows: preflight.rows,
    }),
  };
}

export type ImportResult = {
  imported: number;
  failed: { row: number; name: string; error: string }[];
  alreadyImported?: boolean;
  batchId?: string;
  batchRef?: string;
  status?: string;
  error?: string;
};

export async function confirmHRImportAction(
  _prev: ImportResult | null,
  formData: FormData
): Promise<ImportResult> {
  const session = await requireRole(ROLES.HR);
  const groupId = session.user.groupId;
  const tenantId = session.user.tenantId;

  if (!groupId) return { imported: 0, failed: [], error: "No corporate group associated with your account." };

  const rowsJson = formData.get("rows") as string;
  const fileName = (formData.get("fileName") as string) || null;
  const preflightToken = String(formData.get("preflightToken") ?? "");
  const preflightDate = parseCalendarDate(String(formData.get("preflightDate") ?? ""));
  if (!rowsJson) return { imported: 0, failed: [], error: "Missing data." };

  // WP-B1: never 500 on a malformed / tampered payload.
  let posted: Record<string, unknown>[];
  try {
    const parsed: unknown = JSON.parse(rowsJson);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    posted = parsed.map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {},
    );
  } catch {
    return { imported: 0, failed: [], error: "The submitted data could not be read. Please re-upload the file." };
  }

  if (!preflightToken || !preflightDate) {
    return { imported: 0, failed: [], error: "The validated preview is missing. Re-upload the file before confirming." };
  }

  const previewRows = posted as unknown as MemberImportRow[];
  if (!verifyMemberImportPreviewToken({
    lane: "HR_ENDORSEMENT",
    tenantId,
    groupId,
    effectiveDate: preflightDate,
    rows: previewRows,
  }, preflightToken)) {
    return {
      imported: 0,
      failed: [],
      error: "The validated preview no longer matches the submitted rows. Re-upload the file; nothing was created.",
    };
  }

  const effectiveDate = todayMemberImportEffectiveDate();
  const preflight = await preflightMemberImport({
    db: prisma,
    tenantId,
    groupId,
    lane: "HR_ENDORSEMENT",
    rawRows: posted,
    effectiveDate,
  });
  if (preflight.error) {
    return {
      imported: 0,
      failed: [],
      error: `Current preflight could not be confirmed — ${preflight.error}`,
    };
  }
  const failed: ImportResult["failed"] = [];
  const serverValid: MemberImportRow[] = [];
  const jobRows = preflight.rows.map((row) => ({ ...row }));
  for (const [index, r] of preflight.rows.entries()) {
    const wasRejectedAtPreview = Boolean(previewRows[index]?.error);
    if (r.error) {
      const error = wasRejectedAtPreview ? r.error : `Preflight changed since preview — ${r.error}`;
      jobRows[index].error = error;
      failed.push({
        row: r.row,
        name: `${r.firstName} ${r.lastName}`.trim(),
        error,
      });
    } else if (wasRejectedAtPreview) {
      jobRows[index].error = "Preflight changed since preview — this row now appears valid. Re-upload and review it before committing.";
      failed.push({
        row: r.row,
        name: `${r.firstName} ${r.lastName}`.trim(),
        error: "Preflight changed since preview — this row now appears valid. Re-upload and review it before committing.",
      });
    } else {
      serverValid.push(r);
    }
  }

  // ── WP-B1: idempotency — re-submitting the same file is a deterministic no-op. ──
  const idempotencyKey = createHash("sha256")
    .update(`HR_ENDORSEMENT\u0000${tenantId}\u0000${groupId}\u0000${canonicalMemberImportContent(preflight.rows, "HR_ENDORSEMENT")}`)
    .digest("hex");

  // The first submission may have created endorsements whose later approval
  // created these members. Replay the durable result before treating those
  // newly-existing identities as a fresh import failure.
  const reservation = await MemberImportJobService.reserve(prisma, {
    tenantId, groupId, lane: "HR_ENDORSEMENT", idempotencyKey, fileName,
    createdBy: session.user.id, rows: jobRows,
  });
  if (!reservation.created) {
    if (["SUCCEEDED", "PARTIAL", "FAILED"].includes(reservation.job.status)) {
      return { imported: reservation.job.imported, failed: reservation.job.failed, alreadyImported: true,
        batchId: reservation.job.id, batchRef: reservation.job.batchRef, status: reservation.job.status };
    }
    return { imported: reservation.job.imported, failed: reservation.job.failed,
      batchId: reservation.job.id, batchRef: reservation.job.batchRef, status: reservation.job.status,
      error: `Import ${reservation.job.batchRef} is ${reservation.job.status.toLowerCase()}; its outcome is not being replayed as complete.` };
  }
  const batchId = reservation.job.id;
  if (serverValid.length === 0) {
    const completed = await MemberImportJobService.finalize(prisma, batchId);
    return { imported: 0, failed: completed.failed, batchId, batchRef: completed.batchRef,
      status: completed.status, error: "No valid rows to submit — nothing was created." };
  }
  if (!await MemberImportJobService.claim(prisma, batchId)) {
    return { imported: 0, failed, batchId, batchRef: reservation.job.batchRef,
      status: reservation.job.status,
      error: `Import ${reservation.job.batchRef} could not be claimed for processing.` };
  }

  // ── WP-B4: sequential END-YYYY-NNNNN numbering. Replaces the old random
  // `REQ-${5-digit}` scheme (no uniqueness → ~350 collisions/yr against the
  // (tenantId, endorsementNumber) unique). Seed the base ONCE from the true
  // numeric max (maxByNumericSuffix survives the 99999→100000 zero-pad flip that
  // a lexical sort gets wrong), then advance per row with a P2002-backed retry so
  // a concurrent HR import cannot mint a duplicate. ──
  const yearPrefix = `END-${new Date().getFullYear()}-`;
  const startNumber = await peekNextDocumentNumber("END", async (yp) => {
    const nums = await prisma.endorsement.findMany({
      where: { tenantId, endorsementNumber: { startsWith: yp } },
      select: { endorsementNumber: true },
    });
    return maxByNumericSuffix(nums.map((n) => n.endorsementNumber));
  });
  let nextSeq = Number.parseInt(startNumber.slice(startNumber.lastIndexOf("-") + 1), 10);
  if (!Number.isFinite(nextSeq)) nextSeq = 1;

  // No local success counter — see the note on the admin lane: `finalize` counts
  // the rows marked ACCEPTED, and a parallel tally can only drift from it.
  for (const row of serverValid) {
    const changeDetails = {
      firstName: row.firstName,
      lastName: row.lastName,
      idNumber: row.idNumber || null,
      dateOfBirth: row.dateOfBirth,
      gender: row.gender as Gender,
      phone: row.phone || null,
      email: row.email || null,
      relationship: row.relationship as MemberRelationship,
      principalIdNumber: row.principalIdNumber || null,
      sourceReference: row.sourceReference,
      isBulkImported: true,
    };

    let ok = false;
    let lastError = "";
    let endorsementId: string | undefined;
    for (let attempt = 0; attempt < 50 && !ok; attempt++) {
      const endorsementNumber = `${yearPrefix}${String(nextSeq).padStart(5, "0")}`;
      try {
        const endorsement = await prisma.endorsement.create({
          data: {
            tenantId,
            groupId,
            endorsementNumber,
            type: "MEMBER_ADDITION",
            status: "SUBMITTED",
            effectiveDate,
            requestedBy: session.user.id,
            changeDetails,
          },
        });
        nextSeq++;
        ok = true;
        endorsementId = endorsement.id;
      } catch (err) {
        // Only the endorsementNumber unique can collide here — advance and retry.
        if (isP2002(err)) { nextSeq++; continue; }
        lastError = (err as Error).message;
        break;
      }
    }

    if (ok) {
      await MemberImportJobService.finishRow(prisma, batchId, row.row, {
        status: "ACCEPTED", entityType: "ENDORSEMENT", entityId: endorsementId,
      });
    }
    else {
      const message = lastError || "Could not allocate a unique endorsement number — please retry.";
      failed.push({ row: row.row, name: `${row.firstName} ${row.lastName}`.trim(), error: message });
      await MemberImportJobService.finishRow(prisma, batchId, row.row, { status: "FAILED", code: "ENDORSEMENT_CREATE_FAILED", message });
    }
  }

  const completed = await MemberImportJobService.finalize(prisma, batchId);

  // WP-3.5G: audit the (previously silent) HR bulk-import run.
  await writeAudit({
    userId: session.user.id,
    action: "HR_MEMBERS_BULK_IMPORTED",
    module: "MEMBERS",
    // Both halves read from the ledger — see the note on the admin lane's audit.
    description: `HR bulk import: ${completed.imported} addition request(s) created, ${completed.failed.length} failed.`,
    metadata: { groupId, imported: completed.imported, failed: completed.failed.length, batchId, batchRef: completed.batchRef },
  });

  return { imported: completed.imported, failed: completed.failed, batchId, batchRef: completed.batchRef, status: completed.status };
}
