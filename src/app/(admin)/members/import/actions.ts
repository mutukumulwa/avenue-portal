"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { MembersService } from "@/server/services/members.service";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import Papa from "papaparse";
import { neutralizeFormula } from "@/lib/csv-safe";
import {
  normalizeNationalId,
  normalizeEmail,
  normalizePhone,
  normalizeLegalName,
} from "@/lib/normalize";

export type ParsedRow = {
  row: number;
  firstName: string;
  lastName: string;
  idNumber: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string;
  relationship: string;
  /** National ID of this person's principal — blank for PRINCIPAL rows */
  principalIdNumber: string;
  error?: string;
};

export type ParseResult = {
  rows: ParsedRow[];
  validCount: number;
  errorCount: number;
  /** Non-fatal parser notes: unknown/ignored columns, missing required headers. */
  notes?: string[];
  /** Original file name (carried to the confirm step for the batch ledger). */
  fileName?: string;
  error?: string;
};

const VALID_GENDERS = ["MALE", "FEMALE", "OTHER"];
const VALID_RELATIONSHIPS = ["PRINCIPAL", "SPOUSE", "CHILD", "PARENT", "SIBLING"];

/** canonical header → accepted aliases (matched case-insensitively). */
const HEADER_ALIASES: Record<string, string[]> = {
  firstName: ["firstName", "first_name"],
  lastName: ["lastName", "last_name"],
  idNumber: ["idNumber", "id_number", "national_id"],
  dateOfBirth: ["dateOfBirth", "date_of_birth", "dob"],
  gender: ["gender"],
  phone: ["phone"],
  email: ["email"],
  relationship: ["relationship"],
  principalIdNumber: ["principalIdNumber", "principal_id", "principal_id_number"],
};
const REQUIRED_CANONICAL = ["firstName", "lastName", "dateOfBirth", "gender", "relationship"];
const KNOWN_HEADERS_LC = new Set(
  [...Object.values(HEADER_ALIASES).flat(), "isExample"].map((h) => h.toLowerCase()),
);

/** True when a P2002 unique-constraint violation bubbled up (any driver shape). */
function isP2002(e: unknown): boolean {
  return (e as { code?: string })?.code === "P2002";
}

/**
 * Validate ONE raw row against every field rule, returning a fresh verdict. This
 * is the single source of truth run at BOTH parse time and (re-)run server-side
 * at confirm time — the client's own `error` flag is never trusted. Header lookup
 * is case-insensitive and reorder-safe (keyed by header name, never position), so
 * a shuffled or differently-cased column can never shift data into the wrong field.
 */
function validateRow(raw: Record<string, unknown>, rowNum: number): ParsedRow {
  // Case-insensitive, whitespace-trimmed view of the row keyed by lowercased header.
  const lc: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    lc[k.trim().toLowerCase()] = v == null ? "" : String(v);
  }
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = lc[k.toLowerCase()]?.trim();
      if (v) return v;
    }
    return "";
  };

  // WP-B2: neutralize CSV formula injection on the free-text name fields as they
  // are ingested, so a smuggled `=HYPERLINK(...)` / `+cmd|…` name is defanged
  // before it is ever stored or later exported. (Signed numbers are preserved by
  // neutralizeFormula, so phone/id columns are unaffected.)
  const firstName = neutralizeFormula(get("firstName", "first_name"));
  const lastName = neutralizeFormula(get("lastName", "last_name"));
  const idNumber = get("idNumber", "id_number", "national_id");
  const dateOfBirth = get("dateOfBirth", "date_of_birth", "dob");
  const gender = get("gender").toUpperCase();
  const phone = get("phone");
  const email = get("email");
  const relationship = get("relationship").toUpperCase();
  const principalIdNumber = get("principalIdNumber", "principal_id", "principal_id_number");

  const errors: string[] = [];
  if (!firstName) errors.push("firstName is required");
  if (!lastName) errors.push("lastName is required");
  if (!dateOfBirth) errors.push("dateOfBirth is required");
  if (!gender || !VALID_GENDERS.includes(gender))
    errors.push(`gender must be MALE, FEMALE, or OTHER (got "${gender || "blank"}")`);
  if (!relationship || !VALID_RELATIONSHIPS.includes(relationship))
    errors.push(`relationship must be PRINCIPAL, SPOUSE, CHILD, PARENT, or SIBLING (got "${relationship || "blank"}")`);
  if (dateOfBirth && isNaN(Date.parse(dateOfBirth)))
    errors.push(`dateOfBirth "${dateOfBirth}" is not a valid date (use YYYY-MM-DD)`);
  if (relationship !== "PRINCIPAL" && !principalIdNumber && VALID_RELATIONSHIPS.includes(relationship))
    errors.push(`principalIdNumber is required for ${relationship} rows — enter the National ID of the principal`);

  return {
    row: rowNum,
    firstName, lastName, idNumber, dateOfBirth,
    gender, phone, email, relationship, principalIdNumber,
    ...(errors.length ? { error: errors.join("; ") } : {}),
  };
}

/** Re-run field validation against a posted row's OWN values (ignores client verdict). */
function revalidateRow(r: ParsedRow): ParsedRow {
  return validateRow(
    {
      firstName: r.firstName, lastName: r.lastName, idNumber: r.idNumber,
      dateOfBirth: r.dateOfBirth, gender: r.gender, phone: r.phone,
      email: r.email, relationship: r.relationship, principalIdNumber: r.principalIdNumber,
    },
    r.row,
  );
}

/** Header-level notes: unknown (ignored) columns + entirely-missing required headers. */
function headerNotes(fields: string[] | undefined): string[] {
  const notes: string[] = [];
  const present = new Set((fields ?? []).map((f) => f.trim().toLowerCase()));
  const unknown = (fields ?? []).filter((f) => f.trim() && !KNOWN_HEADERS_LC.has(f.trim().toLowerCase()));
  if (unknown.length) notes.push(`Ignored unrecognised column(s): ${unknown.join(", ")}.`);
  for (const canonical of REQUIRED_CANONICAL) {
    const anyPresent = HEADER_ALIASES[canonical].some((a) => present.has(a.toLowerCase()));
    if (!anyPresent) notes.push(`Missing required column "${canonical}" — every row will fail on this field.`);
  }
  return notes;
}

/** Deterministic content fingerprint of the submitted rows (idempotency basis). */
function canonicalContent(rows: ParsedRow[]): string {
  return JSON.stringify(
    rows.map((r) => [r.firstName, r.lastName, r.idNumber, r.dateOfBirth, r.gender, r.phone, r.email, r.relationship, r.principalIdNumber]),
  );
}

/**
 * WP-B3: reject rows that duplicate an EARLIER row in the same file (by normalized
 * national ID / phone / email / name+DOB). Within-file dupes must be caught here
 * because two brand-new rows are not yet in the DB when createMember probes run.
 */
function dedupeWithinFile(rows: ParsedRow[], failed: ImportResult["failed"]): ParsedRow[] {
  const seenId = new Set<string>();
  const seenPhone = new Set<string>();
  const seenEmail = new Set<string>();
  const seenNameDob = new Set<string>();
  const kept: ParsedRow[] = [];
  for (const r of rows) {
    const idKey = r.idNumber?.trim() ? normalizeNationalId(r.idNumber) : "";
    const phoneKey = r.phone?.trim() ? normalizePhone(r.phone) : null;
    const emailKey = r.email?.trim() ? normalizeEmail(r.email) : "";
    const nameDobKey = `${normalizeLegalName(r.firstName)}|${normalizeLegalName(r.lastName)}|${r.dateOfBirth.trim()}`;

    let dupField = "";
    if (idKey && seenId.has(idKey)) dupField = `National ID "${r.idNumber}"`;
    else if (phoneKey && seenPhone.has(phoneKey)) dupField = `phone "${r.phone}"`;
    else if (emailKey && seenEmail.has(emailKey)) dupField = `email "${r.email}"`;
    else if (seenNameDob.has(nameDobKey)) dupField = "name + date of birth";

    if (dupField) {
      failed.push({
        row: r.row,
        name: `${r.firstName} ${r.lastName}`.trim(),
        error: `Duplicate of an earlier row in this file (same ${dupField}) — not imported.`,
      });
      continue;
    }
    if (idKey) seenId.add(idKey);
    if (phoneKey) seenPhone.add(phoneKey);
    if (emailKey) seenEmail.add(emailKey);
    seenNameDob.add(nameDobKey);
    kept.push(r);
  }
  return kept;
}

export async function parseImportAction(
  _prev: ParseResult | null,
  formData: FormData
): Promise<ParseResult> {
  await requireRole(ROLES.MEMBER_OPS);

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

  if (parseErrorCount && data.length === 0) {
    return { rows: [], validCount: 0, errorCount: 0, error: "Could not parse the CSV file. Make sure it is a valid comma-separated file with a header row." };
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

  const rows = data.map((raw, i) => validateRow(raw, i + 2)); // row 1 = header
  const validCount = rows.filter((r) => !r.error).length;
  const errorCount = rows.filter((r) => r.error).length;
  const notes = headerNotes(fields);

  return { rows, validCount, errorCount, notes: notes.length ? notes : undefined, fileName: file.name || undefined };
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

  if (!groupId || !rowsJson) return { imported: 0, failed: [], error: "Missing data." };

  // WP-B1: never 500 on a malformed / tampered payload.
  let posted: ParsedRow[];
  try {
    const parsed: unknown = JSON.parse(rowsJson);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    posted = parsed as ParsedRow[];
  } catch {
    return { imported: 0, failed: [], error: "The submitted data could not be read. Please re-upload the file." };
  }

  // Tenant-scope the target group (a forged groupId cannot reach another tenant).
  const group = await prisma.group.findFirst({ where: { id: groupId, tenantId }, select: { id: true, name: true } });
  if (!group) return { imported: 0, failed: [], error: "Target group not found for your organisation." };

  // ── WP-B1: RE-VALIDATE every row server-side. The client-posted `error`/valid
  // classification is discarded entirely — a stale or tampered payload cannot slip
  // an invalid row past the server. ──
  const failed: ImportResult["failed"] = [];
  const revalidated = posted.map(revalidateRow);
  for (const r of revalidated) {
    if (r.error) failed.push({ row: r.row, name: `${r.firstName} ${r.lastName}`.trim(), error: r.error });
  }
  // WP-B3: drop within-file duplicates (row-level reasons pushed onto `failed`).
  const serverValid = dedupeWithinFile(revalidated.filter((r) => !r.error), failed);

  // WP-B2: empty / header-only / all-invalid → refuse with a clear message and NO
  // success audit (the success writeAudit below is never reached on this path).
  if (serverValid.length === 0) {
    return { imported: 0, failed, error: "No valid rows to import — nothing was created." };
  }

  // ── WP-B1: idempotency. Key = sha256(lane + tenant + group + canonical content).
  // Re-confirming the same file for the same group is a deterministic no-op. ──
  const idempotencyKey = createHash("sha256")
    .update(`MEMBERS_ADMIN ${tenantId} ${groupId} ${canonicalContent(posted)}`)
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

  // Reserve the batch (claims the idempotency key). A concurrent identical confirm
  // loses the race on the unique and returns the winner's recorded result.
  let batchId: string;
  try {
    const batch = await prisma.importBatch.create({
      data: { tenantId, groupId, lane: "MEMBERS_ADMIN", idempotencyKey, fileName, totalRows: posted.length, createdBy: session.user.id },
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
        where: { tenantId, groupId, relationship: "PRINCIPAL", idNumber: { equals: refKey, mode: "insensitive" } },
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
    description: `Bulk import: ${imported} members added to ${group.name}. ${failed.length} failed.`,
    metadata: { groupId, imported, failed: failed.length, batchId },
  });

  return { imported, failed, batchId };
}
