"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import Papa from "papaparse";
import type { Gender, MemberRelationship } from "@prisma/client";
import { checkEnrolmentAge } from "@/server/services/eligibility/enrolment-age";
import { peekNextDocumentNumber, maxByNumericSuffix } from "@/lib/document-number";
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
  principalIdNumber: string;
  error?: string;
};

export type ParseResult = {
  rows: ParsedRow[];
  validCount: number;
  errorCount: number;
  notes?: string[];
  fileName?: string;
  error?: string;
};

const VALID_GENDERS = ["MALE", "FEMALE", "OTHER"];
const VALID_RELATIONSHIPS = ["PRINCIPAL", "SPOUSE", "CHILD", "PARENT", "SIBLING"];

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

function isP2002(e: unknown): boolean {
  return (e as { code?: string })?.code === "P2002";
}

/** Single validation source, run at parse time AND re-run server-side at confirm. */
function validateRow(raw: Record<string, unknown>, rowNum: number): ParsedRow {
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

  // WP-B2: neutralize CSV formula injection on the free-text name fields on ingest.
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

function canonicalContent(rows: ParsedRow[]): string {
  return JSON.stringify(
    rows.map((r) => [r.firstName, r.lastName, r.idNumber, r.dateOfBirth, r.gender, r.phone, r.email, r.relationship, r.principalIdNumber]),
  );
}

/** WP-B3: reject rows that duplicate an earlier row in the same file. */
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
        error: `Duplicate of an earlier row in this file (same ${dupField}) — not submitted.`,
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

export async function parseHRImportAction(
  _prev: ParseResult | null,
  formData: FormData
): Promise<ParseResult> {
  await requireRole(ROLES.HR);

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

  if (parseErrorCount && data.length === 0) {
    return { rows: [], validCount: 0, errorCount: 0, error: "Could not parse the CSV file. Make sure it is a valid comma-separated file with a header row." };
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

  const rows = data.map((raw, i) => validateRow(raw, i + 2));
  const validCount = rows.filter((r) => !r.error).length;
  const errorCount = rows.filter((r) => r.error).length;
  const notes = headerNotes(fields);

  return { rows, validCount, errorCount, notes: notes.length ? notes : undefined, fileName: file.name || undefined };
}

export type ImportResult = {
  imported: number;
  failed: { row: number; name: string; error: string }[];
  alreadyImported?: boolean;
  batchId?: string;
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
  if (!rowsJson) return { imported: 0, failed: [], error: "Missing data." };

  // WP-B1: never 500 on a malformed / tampered payload.
  let posted: ParsedRow[];
  try {
    const parsed: unknown = JSON.parse(rowsJson);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    posted = parsed as ParsedRow[];
  } catch {
    return { imported: 0, failed: [], error: "The submitted data could not be read. Please re-upload the file." };
  }

  // ── WP-B1: RE-VALIDATE every row server-side (client verdict is discarded). ──
  const failed: ImportResult["failed"] = [];
  const revalidated = posted.map(revalidateRow);
  for (const r of revalidated) {
    if (r.error) failed.push({ row: r.row, name: `${r.firstName} ${r.lastName}`.trim(), error: r.error });
  }
  // WP-B3: within-file duplicate rejection.
  const serverValid = dedupeWithinFile(revalidated.filter((r) => !r.error), failed);

  // WP-B2: empty / header-only / all-invalid → refuse, NO success audit.
  if (serverValid.length === 0) {
    return { imported: 0, failed, error: "No valid rows to submit — nothing was created." };
  }

  // ── WP-B1: idempotency — re-submitting the same file is a deterministic no-op. ──
  const idempotencyKey = createHash("sha256")
    .update(`HR_ENDORSEMENT ${tenantId} ${groupId} ${canonicalContent(posted)}`)
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

  let batchId: string;
  try {
    const batch = await prisma.importBatch.create({
      data: { tenantId, groupId, lane: "HR_ENDORSEMENT", idempotencyKey, fileName, totalRows: posted.length, createdBy: session.user.id },
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

  // WP-3.5D: reject over-age / future-DOB rows up front against the scheme
  // package's caps (re-enforced when the endorsement is approved).
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { packageId: true } });
  const ageRules = group
    ? await prisma.package.findUnique({ where: { id: group.packageId }, select: { maxAge: true, dependentMaxAge: true } })
    : null;
  const enrolmentAsOf = new Date();

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

  let imported = 0;
  for (const row of serverValid) {
    const age = checkEnrolmentAge({ relationship: row.relationship, dateOfBirth: row.dateOfBirth }, enrolmentAsOf, ageRules);
    if (!age.ok) {
      failed.push({ row: row.row, name: `${row.firstName} ${row.lastName}`.trim(), error: age.reason });
      continue;
    }

    const changeDetails = {
      firstName: row.firstName,
      lastName: row.lastName,
      idNumber: row.idNumber || null,
      dateOfBirth: new Date(row.dateOfBirth).toISOString(),
      gender: row.gender as Gender,
      phone: row.phone || null,
      email: row.email || null,
      relationship: row.relationship as MemberRelationship,
      principalIdNumber: row.principalIdNumber || null,
      isBulkImported: true,
    };

    let ok = false;
    let lastError = "";
    for (let attempt = 0; attempt < 50 && !ok; attempt++) {
      const endorsementNumber = `${yearPrefix}${String(nextSeq).padStart(5, "0")}`;
      try {
        await prisma.endorsement.create({
          data: {
            tenantId,
            groupId,
            endorsementNumber,
            type: "MEMBER_ADDITION",
            status: "SUBMITTED",
            effectiveDate: new Date(),
            requestedBy: session.user.id,
            changeDetails,
          },
        });
        nextSeq++;
        ok = true;
      } catch (err) {
        // Only the endorsementNumber unique can collide here — advance and retry.
        if (isP2002(err)) { nextSeq++; continue; }
        lastError = (err as Error).message;
        break;
      }
    }

    if (ok) imported++;
    else failed.push({ row: row.row, name: `${row.firstName} ${row.lastName}`.trim(), error: lastError || "Could not allocate a unique endorsement number — please retry." });
  }

  await prisma.importBatch.update({
    where: { id: batchId },
    data: { importedCount: imported, failedCount: failed.length, rejects: failed as unknown as Prisma.InputJsonValue },
  });

  // WP-3.5G: audit the (previously silent) HR bulk-import run.
  await writeAudit({
    userId: session.user.id,
    action: "HR_MEMBERS_BULK_IMPORTED",
    module: "MEMBERS",
    description: `HR bulk import: ${imported} addition request(s) created, ${failed.length} failed.`,
    metadata: { groupId, imported, failed: failed.length, batchId },
  });

  return { imported, failed, batchId };
}
