"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { MembersService } from "@/server/services/members.service";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { Prisma } from "@prisma/client";
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

/** True when a P2002 unique-constraint violation bubbled up (any driver shape). */
function isP2002(e: unknown): boolean {
  return (e as { code?: string })?.code === "P2002";
}

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
  for (const [index, r] of preflight.rows.entries()) {
    const wasRejectedAtPreview = Boolean(previewRows[index]?.error);
    if (r.error) {
      failed.push({
        row: r.row,
        name: `${r.firstName} ${r.lastName}`.trim(),
        error: wasRejectedAtPreview
          ? r.error
          : `Preflight changed since preview — ${r.error}`,
      });
    } else if (wasRejectedAtPreview) {
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

  const existing = await prisma.importBatch.findUnique({
    where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    select: { id: true, importedCount: true, rejects: true },
  });
  if (existing) {
    return {
      imported: existing.importedCount,
      failed: (existing.rejects as ImportResult["failed"]) ?? [],
      alreadyImported: true,
      batchId: existing.id,
    };
  }

  // Check replay BEFORE refusing the now-conflicting rows: after a successful
  // first import, those national IDs correctly exist in the database. That is
  // evidence of the prior result, not a reason to hide it on repeat confirm.
  if (serverValid.length === 0) {
    return { imported: 0, failed, error: "No valid rows to import — nothing was created." };
  }

  // Reserve the batch (claims the idempotency key). A concurrent identical confirm
  // loses the race on the unique and returns the winner's recorded result.
  let batchId: string;
  try {
    const batch = await prisma.importBatch.create({
      data: { tenantId, groupId, lane: "MEMBERS_ADMIN", idempotencyKey, fileName, totalRows: preflight.rows.length, createdBy: session.user.id },
      select: { id: true },
    });
    batchId = batch.id;
  } catch (err) {
    if (isP2002(err)) {
      const winner = await prisma.importBatch.findUnique({
        where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
        select: { id: true, importedCount: true, rejects: true },
      });
      if (winner) {
        return {
          imported: winner.importedCount,
          failed: (winner.rejects as ImportResult["failed"]) ?? [],
          alreadyImported: true,
          batchId: winner.id,
        };
      }
    }
    throw err;
  }

  let imported = 0;

  // ── Pass 1: PRINCIPAL rows. Map normalized National ID → created member id. ──
  const principalMap = new Map<string, string>();
  for (const row of serverValid.filter((r) => r.relationship === "PRINCIPAL")) {
    try {
      const { member } = await MembersService.createMember(tenantId, {
        groupId,
        firstName: row.firstName,
        lastName: row.lastName,
        idNumber: row.idNumber || undefined,
        dateOfBirth: row.dateOfBirth,
        gender: row.gender as "MALE" | "FEMALE" | "OTHER",
        phone: row.phone || undefined,
        email: row.email || undefined,
        relationship: "PRINCIPAL",
      });
      imported++;
      const key = row.idNumber?.trim() ? normalizeNationalId(row.idNumber) : "";
      if (key) principalMap.set(key, member.id);
    } catch (err) {
      failed.push({ row: row.row, name: `${row.firstName} ${row.lastName}`.trim(), error: (err as Error).message });
    }
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
      continue;
    }

    try {
      await MembersService.createMember(tenantId, {
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
      });
      imported++;
    } catch (err) {
      failed.push({ row: row.row, name: `${row.firstName} ${row.lastName}`.trim(), error: (err as Error).message });
    }
  }

  // Finalize the ledger — persist counts + the durable reject list.
  await prisma.importBatch.update({
    where: { id: batchId },
    data: { importedCount: imported, failedCount: failed.length, rejects: failed as unknown as Prisma.InputJsonValue },
  });

  await writeAudit({
    userId: session.user.id,
    action: "MEMBERS_BULK_IMPORTED",
    module: "MEMBERS",
    description: `Bulk import: ${imported} members added to ${preflight.groupName}. ${failed.length} failed.`,
    metadata: { groupId, imported, failed: failed.length, batchId },
  });

  return { imported, failed, batchId };
}
