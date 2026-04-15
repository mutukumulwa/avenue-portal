"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { MembersService } from "@/server/services/members.service";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import Papa from "papaparse";

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
  error?: string;
};

const VALID_GENDERS       = ["MALE", "FEMALE", "OTHER"];
const VALID_RELATIONSHIPS = ["PRINCIPAL", "SPOUSE", "CHILD", "PARENT"];

function get(raw: Record<string, string>, ...keys: string[]) {
  for (const k of keys) {
    const v = raw[k]?.trim() ?? raw[k.toLowerCase()]?.trim() ?? "";
    if (v) return v;
  }
  return "";
}

function validateRow(raw: Record<string, string>, rowNum: number): ParsedRow {
  const firstName         = get(raw, "firstName", "first_name");
  const lastName          = get(raw, "lastName",  "last_name");
  const idNumber          = get(raw, "idNumber",  "id_number", "national_id");
  const dateOfBirth       = get(raw, "dateOfBirth", "date_of_birth", "dob");
  const gender            = get(raw, "gender").toUpperCase();
  const phone             = get(raw, "phone");
  const email             = get(raw, "email");
  const relationship      = get(raw, "relationship").toUpperCase();
  const principalIdNumber = get(raw, "principalIdNumber", "principal_id", "principal_id_number");

  const errors: string[] = [];
  if (!firstName)   errors.push("firstName is required");
  if (!lastName)    errors.push("lastName is required");
  if (!dateOfBirth) errors.push("dateOfBirth is required");
  if (!gender || !VALID_GENDERS.includes(gender))
    errors.push(`gender must be MALE, FEMALE, or OTHER (got "${gender || "blank"}")`);
  if (!relationship || !VALID_RELATIONSHIPS.includes(relationship))
    errors.push(`relationship must be PRINCIPAL, SPOUSE, CHILD, or PARENT (got "${relationship || "blank"}")`);
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

export async function parseImportAction(
  _prev: ParseResult | null,
  formData: FormData
): Promise<ParseResult> {
  await requireRole(ROLES.OPS);

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { rows: [], validCount: 0, errorCount: 0, error: "No file uploaded." };
  }

  const text = await file.text();
  const { data, errors } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (errors.length && data.length === 0) {
    return { rows: [], validCount: 0, errorCount: 0, error: "Could not parse the CSV file. Make sure it is a valid comma-separated file with a header row." };
  }

  // Reject if example rows are still present
  const hasExamples = data.some(row =>
    (row["isExample"] ?? row["isexample"] ?? "").toLowerCase().trim() === "true"
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
  const validCount = rows.filter(r => !r.error).length;
  const errorCount = rows.filter(r =>  r.error).length;

  return { rows, validCount, errorCount };
}

export type ImportResult = {
  imported: number;
  failed: { row: number; name: string; error: string }[];
  error?: string;
};

export async function confirmImportAction(
  _prev: ImportResult | null,
  formData: FormData
): Promise<ImportResult> {
  const session = await requireRole(ROLES.OPS);

  const groupId  = formData.get("groupId")  as string;
  const rowsJson = formData.get("rows")     as string;

  if (!groupId || !rowsJson) return { imported: 0, failed: [], error: "Missing data." };

  const rows: ParsedRow[] = JSON.parse(rowsJson);
  const valid = rows.filter(r => !r.error);

  const failed: ImportResult["failed"] = [];
  let imported = 0;

  // ── Pass 1: create all PRINCIPAL rows ────────────────────────────────────
  // Build a map: National ID → created member ID, for dependant linking.
  const principalMap = new Map<string, string>(); // idNumber → memberId

  for (const row of valid.filter(r => r.relationship === "PRINCIPAL")) {
    try {
      const { member } = await MembersService.createMember(session.user.tenantId, {
        groupId,
        firstName:    row.firstName,
        lastName:     row.lastName,
        idNumber:     row.idNumber || undefined,
        dateOfBirth:  row.dateOfBirth,
        gender:       row.gender as "MALE" | "FEMALE" | "OTHER",
        phone:        row.phone  || undefined,
        email:        row.email  || undefined,
        relationship: "PRINCIPAL",
      });
      imported++;
      if (row.idNumber) principalMap.set(row.idNumber, member.id);
    } catch (err) {
      failed.push({ row: row.row, name: `${row.firstName} ${row.lastName}`, error: (err as Error).message });
    }
  }

  // ── Pass 2: create dependants, linked to their principal ─────────────────
  const dependants = valid.filter(r => r.relationship !== "PRINCIPAL");
  for (const row of dependants) {
    // Look up principalId — first from this import batch, then from DB
    let principalId = row.principalIdNumber ? principalMap.get(row.principalIdNumber) : undefined;

    if (!principalId && row.principalIdNumber) {
      const existing = await prisma.member.findFirst({
        where: { tenantId: session.user.tenantId, idNumber: row.principalIdNumber },
        select: { id: true },
      });
      if (existing) principalId = existing.id;
    }

    try {
      await MembersService.createMember(session.user.tenantId, {
        groupId,
        firstName:    row.firstName,
        lastName:     row.lastName,
        idNumber:     row.idNumber || undefined,
        dateOfBirth:  row.dateOfBirth,
        gender:       row.gender as "MALE" | "FEMALE" | "OTHER",
        phone:        row.phone  || undefined,
        email:        row.email  || undefined,
        relationship: row.relationship as "SPOUSE" | "CHILD" | "PARENT",
        principalId,
      });
      imported++;
    } catch (err) {
      failed.push({ row: row.row, name: `${row.firstName} ${row.lastName}`, error: (err as Error).message });
    }
  }

  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { name: true } });

  await writeAudit({
    userId: session.user.id,
    action: "MEMBERS_BULK_IMPORTED",
    module: "MEMBERS",
    description: `Bulk import: ${imported} members added to ${group?.name ?? groupId}. ${failed.length} failed.`,
    metadata: { groupId, imported, failed: failed.length },
  });

  return { imported, failed };
}
