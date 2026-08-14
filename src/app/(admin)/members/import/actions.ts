"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { MembersService } from "@/server/services/members.service";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { createHash } from "crypto";
import Papa from "papaparse";
import { normalizeNationalId } from "@/lib/normalize";
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
  /** Non-fatal parser notes: unknown/ignored columns, missing required headers. */
  notes?: string[];
  /** Original file name (carried to the confirm step for the batch ledger). */
  fileName?: string;
  /** Server-authenticated canonical rows + preview verdict mask. */
  preflightToken?: string;
  /** Signed preview calendar day; commit revalidates against the current day. */
  preflightDate?: string;
  error?: string;
};

export async function parseImportAction(
  _prev: ParseResult | null,
  formData: FormData
): Promise<ParseResult> {
  const session = await requireRole(ROLES.MEMBER_OPS);

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { rows: [], validCount: 0, errorCount: 0, error: "No file uploaded." };
  }

  // WP-B2: reject non-CSV/binary uploads before parsing so a wrong file type can
  // never be silently mis-parsed into partial rows. A ".csv"/text file may still
  // be malformed — that is caught by the parse guard below.
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
    // A binary file decoded as text carries NUL bytes — refuse rather than parse garbage.
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

  // Reject if example rows are still present (aborts the WHOLE parse).
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

  const groupId = String(formData.get("groupId") ?? "").trim();
  if (!groupId) {
    return { rows: [], validCount: 0, errorCount: 0, error: "Select a target group before validating the file." };
  }
  const effectiveDate = todayMemberImportEffectiveDate();
  const preflightDate = calendarDateFromUtcDate(effectiveDate)!;
  const preflight = await preflightMemberImport({
    db: prisma,
    tenantId: session.user.tenantId,
    groupId,
    lane: "MEMBERS_ADMIN",
    rawRows: data,
    effectiveDate,
  });
  if (preflight.error) {
    return { rows: [], validCount: 0, errorCount: 0, error: preflight.error };
  }
  const notes = memberImportHeaderNotes(fields, "MEMBERS_ADMIN");

  return {
    rows: preflight.rows,
    validCount: preflight.validCount,
    errorCount: preflight.errorCount,
    notes: notes.length ? notes : undefined,
    fileName: file.name || undefined,
    preflightDate,
    preflightToken: createMemberImportPreviewToken({
      lane: "MEMBERS_ADMIN",
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
  /** True when this exact file+group was already imported — a deterministic no-op. */
  alreadyImported?: boolean;
  /** The persisted ImportBatch id (reject list is stored on it). */
  batchId?: string;
  batchRef?: string;
  status?: string;
  error?: string;
};

export async function confirmImportAction(
  _prev: ImportResult | null,
  formData: FormData
): Promise<ImportResult> {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const tenantId = session.user.tenantId;

  const groupId = formData.get("groupId") as string;
  const rowsJson = formData.get("rows") as string;
  const fileName = (formData.get("fileName") as string) || null;
  const preflightToken = String(formData.get("preflightToken") ?? "");
  const preflightDate = parseCalendarDate(String(formData.get("preflightDate") ?? ""));

  if (!groupId || !rowsJson) return { imported: 0, failed: [], error: "Missing data." };

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
    lane: "MEMBERS_ADMIN",
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

  // P06.01: preview and confirm call the SAME database-aware preflight. The
  // posted verdict is discarded; current group/package/principal/identity state
  // is read again immediately before any batch reservation or member write.
  const preflight = await preflightMemberImport({
    db: prisma,
    tenantId,
    groupId,
    lane: "MEMBERS_ADMIN",
    rawRows: posted,
    effectiveDate: todayMemberImportEffectiveDate(),
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

  // ── WP-B1: idempotency. Key = sha256(lane + tenant + group + canonical content).
  // Re-confirming the same file for the same group is a deterministic no-op. ──
  const idempotencyKey = createHash("sha256")
    .update(`MEMBERS_ADMIN\u0000${tenantId}\u0000${groupId}\u0000${canonicalMemberImportContent(preflight.rows, "MEMBERS_ADMIN")}`)
    .digest("hex");

  const reservation = await MemberImportJobService.reserve(prisma, {
    tenantId, groupId, lane: "MEMBERS_ADMIN", idempotencyKey, fileName,
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
      status: completed.status, error: "No valid rows to import — nothing was created." };
  }
  if (!await MemberImportJobService.claim(prisma, batchId)) {
    return { imported: 0, failed, batchId, batchRef: reservation.job.batchRef,
      status: reservation.job.status,
      error: `Import ${reservation.job.batchRef} could not be claimed for processing.` };
  }

  // No local success counter: `finalize` derives the count from the rows this
  // function marks ACCEPTED, and a second tally kept alongside it can only ever
  // drift from the ledger that is now the record.

  // ── Pass 1: PRINCIPAL rows. Map normalized National ID → created member id. ──
  const principalMap = new Map<string, string>();
  for (const row of serverValid.filter((r) => r.relationship === "PRINCIPAL")) {
    let member: { id: string };
    try {
      ({ member } = await MembersService.createMember(tenantId, {
        groupId,
        firstName: row.firstName,
        lastName: row.lastName,
        idNumber: row.idNumber || undefined,
        dateOfBirth: row.dateOfBirth,
        gender: row.gender as "MALE" | "FEMALE" | "OTHER",
        phone: row.phone || undefined,
        email: row.email || undefined,
        relationship: "PRINCIPAL",
      }));
    } catch (err) {
      const message = (err as Error).message;
      failed.push({ row: row.row, name: `${row.firstName} ${row.lastName}`.trim(), error: message });
      await MemberImportJobService.finishRow(prisma, batchId, row.row, { status: "FAILED", code: "MEMBER_CREATE_FAILED", message });
      continue;
    }
    await MemberImportJobService.finishRow(prisma, batchId, row.row, {
      status: "ACCEPTED", entityType: "MEMBER", entityId: member.id,
    });
    const key = row.idNumber?.trim() ? normalizeNationalId(row.idNumber) : "";
    if (key) principalMap.set(key, member.id);
  }

  // ── Pass 2: dependants, linked to a principal IN THE IMPORT'S GROUP. ──
  for (const row of serverValid.filter((r) => r.relationship !== "PRINCIPAL")) {
    const refKey = row.principalIdNumber?.trim() ? normalizeNationalId(row.principalIdNumber) : "";
    let principalId = refKey ? principalMap.get(refKey) : undefined;

    // WP-B3: DB fallback is SCOPED TO THE TARGET GROUP (previously tenant-wide, so a
    // dependant could bind to a principal in a different scheme).
    if (!principalId && refKey) {
      const existingPrincipal = await prisma.member.findFirst({
        where: { tenantId, groupId, relationship: "PRINCIPAL", nationalIdNormalized: refKey },
        select: { id: true },
      });
      if (existingPrincipal) principalId = existingPrincipal.id;
    }

    // WP-B3: an unknown/failed principal → the dependant FAILS with a principal-
    // specific reason. It is never silently created as an orphan root and counted
    // imported (the previous behaviour).
    if (!principalId) {
      failed.push({
        row: row.row,
        name: `${row.firstName} ${row.lastName}`.trim(),
        error: refKey
          ? `Principal with National ID "${row.principalIdNumber}" was not found in this group — dependant not imported.`
          : `No principalIdNumber supplied for this ${row.relationship} — dependant not imported.`,
      });
      // PRINCIPAL_NOT_FOUND, not PRINCIPAL_CREATE_FAILED: nothing was created and
      // nothing failed to create. The principal is simply absent from this group,
      // which is a different thing to look for when reading the ledger back.
      await MemberImportJobService.finishRow(prisma, batchId, row.row, { status: "FAILED", code: "PRINCIPAL_NOT_FOUND", message: failed.at(-1)!.error });
      continue;
    }

    let member: { id: string };
    try {
      ({ member } = await MembersService.createMember(tenantId, {
        groupId,
        firstName: row.firstName,
        lastName: row.lastName,
        idNumber: row.idNumber || undefined,
        dateOfBirth: row.dateOfBirth,
        gender: row.gender as "MALE" | "FEMALE" | "OTHER",
        phone: row.phone || undefined,
        email: row.email || undefined,
        relationship: row.relationship as "SPOUSE" | "CHILD" | "PARENT" | "SIBLING",
        principalId,
      }));
    } catch (err) {
      const message = (err as Error).message;
      failed.push({ row: row.row, name: `${row.firstName} ${row.lastName}`.trim(), error: message });
      await MemberImportJobService.finishRow(prisma, batchId, row.row, { status: "FAILED", code: "MEMBER_CREATE_FAILED", message });
      continue;
    }
    await MemberImportJobService.finishRow(prisma, batchId, row.row, { status: "ACCEPTED", entityType: "MEMBER", entityId: member.id });
  }

  const completed = await MemberImportJobService.finalize(prisma, batchId);

  await writeAudit({
    userId: session.user.id,
    action: "MEMBERS_BULK_IMPORTED",
    module: "MEMBERS",
    // Both halves read from the ledger. They used to disagree by construction:
    // the sentence counted rows and the metadata summed `recordCount`, which is
    // 1 per row today and exists so that it need not stay that way.
    description: `Bulk import: ${completed.imported} members added to ${preflight.groupName}. ${completed.failed.length} failed.`,
    metadata: { groupId, imported: completed.imported, failed: completed.failed.length, batchId, batchRef: completed.batchRef },
  });

  return { imported: completed.imported, failed: completed.failed, batchId, batchRef: completed.batchRef, status: completed.status };
}
