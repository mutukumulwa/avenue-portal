"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Papa from "papaparse";
import type { Gender, MemberRelationship } from "@prisma/client";

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

export async function parseHRImportAction(
  _prev: ParseResult | null,
  formData: FormData
): Promise<ParseResult> {
  await requireRole(ROLES.HR);

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

  const rows = data.map((raw, i) => validateRow(raw, i + 2));
  const validCount = rows.filter(r => !r.error).length;
  const errorCount = rows.filter(r =>  r.error).length;

  return { rows, validCount, errorCount };
}

export type ImportResult = {
  imported: number;
  failed: { row: number; name: string; error: string }[];
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
  if (!rowsJson) return { imported: 0, failed: [], error: "Missing data." };

  const rows: ParsedRow[] = JSON.parse(rowsJson);
  const valid = rows.filter(r => !r.error);

  const failed: ImportResult["failed"] = [];
  let imported = 0;

  for (const row of valid) {
    try {
      const endorsementNumber = `REQ-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

      await prisma.endorsement.create({
        data: {
          tenantId,
          groupId,
          endorsementNumber,
          type: "MEMBER_ADDITION",
          status: "SUBMITTED",
          effectiveDate: new Date(),
          requestedBy: session.user.id,
          changeDetails: {
            firstName: row.firstName,
            lastName: row.lastName,
            idNumber: row.idNumber || null,
            dateOfBirth: new Date(row.dateOfBirth).toISOString(),
            gender: row.gender as Gender,
            phone: row.phone || null,
            email: row.email || null,
            relationship: row.relationship as MemberRelationship,
            principalIdNumber: row.principalIdNumber || null,
            isBulkImported: true
          }
        }
      });
      imported++;
    } catch (err) {
      failed.push({ row: row.row, name: `${row.firstName} ${row.lastName}`, error: (err as Error).message });
    }
  }

  return { imported, failed };
}
