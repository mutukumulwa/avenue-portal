/**
 * UAT-HF P06.01 — one preflight for every member-import rail.
 *
 * CSV parsing produces untrusted strings. Preview and commit both call this
 * module with those strings; neither action accepts a browser-posted `error`
 * flag as a verdict. The preflight owns field/date/identity/scheme/principal
 * checks and returns the canonical row that the eventual write receives.
 */
import type { MemberStatus, Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  normalizeEmail,
  normalizeLegalName,
  normalizeNationalId,
  normalizePhone,
} from "@/lib/normalize";
import { validateMemberDemographics } from "@/lib/member-demographics";
import { resolveMemberEnrolmentDates } from "@/lib/member-enrolment";
import {
  calendarDateFromUtcDate,
  calendarDateToUtcDate,
  todayCalendarDate,
  type CalendarDate,
} from "@/lib/calendar-date";
import { checkEnrolmentAge } from "@/server/services/eligibility/enrolment-age";
import { MATCH_MESSAGE } from "@/server/services/identity-match.service";
import { canPerformMemberAction } from "@/lib/member-action-policy";

export type MemberImportLane = "MEMBERS_ADMIN" | "HR_ENDORSEMENT";

export interface MemberImportRow {
  row: number;
  firstName: string;
  lastName: string;
  idNumber: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string;
  relationship: string;
  /** National ID of this person's principal — blank for PRINCIPAL rows. */
  principalIdNumber: string;
  /** Required on the HR lane so the resulting endorsement is approvable. */
  sourceReference: string;
  error?: string;
  warnings?: string[];
}

export interface MemberImportPreflight {
  rows: MemberImportRow[];
  validCount: number;
  errorCount: number;
  groupName?: string;
  error?: string;
}

export interface MemberImportPreviewClaim {
  lane: MemberImportLane;
  tenantId: string;
  groupId: string;
  effectiveDate: CalendarDate;
  rows: MemberImportRow[];
}

export const MEMBER_IMPORT_HEADER_ALIASES: Record<
  Exclude<keyof MemberImportRow, "row" | "error" | "warnings">,
  string[]
> = {
  firstName: ["firstName", "first_name"],
  lastName: ["lastName", "last_name"],
  idNumber: ["idNumber", "id_number", "national_id"],
  dateOfBirth: ["dateOfBirth", "date_of_birth", "dob"],
  gender: ["gender"],
  phone: ["phone"],
  email: ["email"],
  relationship: ["relationship"],
  principalIdNumber: ["principalIdNumber", "principal_id", "principal_id_number"],
  sourceReference: ["sourceReference", "source_reference", "document_reference"],
};

const BASE_REQUIRED_HEADERS = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "gender",
  "relationship",
] as const;

const KNOWN_HEADERS = new Set(
  [...Object.values(MEMBER_IMPORT_HEADER_ALIASES).flat(), "isExample"].map((header) =>
    header.toLowerCase(),
  ),
);

function scalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return "";
}

function appendError(row: MemberImportRow, message: string): void {
  row.error = row.error ? `${row.error}; ${message}` : message;
}

function appendWarning(row: MemberImportRow, message: string): void {
  row.warnings ??= [];
  if (!row.warnings.includes(message)) row.warnings.push(message);
}

function canonicalRow(
  raw: Record<string, unknown>,
  fallbackRow: number,
  lane: MemberImportLane,
  effectiveDate: CalendarDate,
): MemberImportRow {
  const lower: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    lower[key.trim().toLowerCase()] = scalar(value);
  }
  const get = (field: keyof typeof MEMBER_IMPORT_HEADER_ALIASES): string => {
    for (const alias of MEMBER_IMPORT_HEADER_ALIASES[field]) {
      const value = lower[alias.toLowerCase()];
      if (value) return value;
    }
    return "";
  };

  // ── UAT-HF P06.07 — DEF-038 ──────────────────────────────────────────────
  //
  // "Values beginning with =, +, @ or - are rendered and stored with a leading
  // apostrophe: '=2+2' becomes \"'=2+2\" ... The committed roster preserves the
  // source text exactly." The register is careful to call the old behaviour "a
  // deliberate CSV/spreadsheet formula-injection defence, and a good one" — the
  // objection is not to the defence but to where it was applied.
  //
  // A stored name is data. The injection risk lives in the spreadsheet that
  // later OPENS an export, so that is the boundary to defend, and `csvSafeCell`
  // already does it on every cell of every export — independently of this. The
  // import-side call therefore protected nothing that was not already protected
  // and silently altered the source text on the way through.
  //
  // Removing it loses no defence: a name stored as `=2+2` is still exported as
  // `'=2+2`, so no spreadsheet ever evaluates it. What changes is that the
  // member's record now says what the employer sent.
  const firstName = get("firstName");
  const lastName = get("lastName");
  const gender = get("gender").toUpperCase();
  const relationship = get("relationship").toUpperCase();
  const demographics = validateMemberDemographics({
    firstName,
    lastName,
    gender,
    relationship,
    phone: get("phone"),
    email: get("email"),
  });

  const row: MemberImportRow = {
    // The source position is derived from the server-parsed array. A posted
    // `row: 999999` is presentation data, not provenance.
    row: fallbackRow,
    firstName: demographics.ok ? demographics.value.firstName : firstName,
    lastName: demographics.ok ? demographics.value.lastName : lastName,
    idNumber: get("idNumber") ? normalizeNationalId(get("idNumber")) : "",
    dateOfBirth: get("dateOfBirth"),
    gender: demographics.ok ? demographics.value.gender : gender,
    phone: demographics.ok ? demographics.value.phone ?? "" : get("phone"),
    email: demographics.ok ? demographics.value.email ?? "" : get("email"),
    relationship: demographics.ok ? demographics.value.relationship : relationship,
    principalIdNumber: get("principalIdNumber")
      ? normalizeNationalId(get("principalIdNumber"))
      : "",
    sourceReference: get("sourceReference"),
  };

  if (!demographics.ok) {
    for (const messages of Object.values(demographics.fieldErrors)) {
      for (const message of messages) appendError(row, message);
    }
  }

  const dates = resolveMemberEnrolmentDates({
    dateOfBirth: row.dateOfBirth,
    effectiveDate,
    relationship: row.relationship,
  }, effectiveDate);
  if (!dates.ok) {
    for (const messages of Object.values(dates.fieldErrors)) {
      for (const message of messages) appendError(row, message);
    }
  } else {
    row.dateOfBirth = dates.value.dateOfBirth;
  }

  if (row.relationship !== "PRINCIPAL" && !row.principalIdNumber) {
    appendError(
      row,
      `Principal National ID is required for ${row.relationship || "dependant"} rows.`,
    );
  }
  if (lane === "HR_ENDORSEMENT" && !row.sourceReference) {
    appendError(row, "HR source/document reference is required for every row.");
  }
  if (row.sourceReference.length > 120) {
    appendError(row, "Source reference must use 120 characters or fewer.");
  }
  return row;
}

export function memberImportHeaderNotes(
  fields: string[] | undefined,
  lane: MemberImportLane,
): string[] {
  const notes: string[] = [];
  const present = new Set((fields ?? []).map((field) => field.trim().toLowerCase()));
  const unknown = (fields ?? []).filter(
    (field) => field.trim() && !KNOWN_HEADERS.has(field.trim().toLowerCase()),
  );
  if (unknown.length > 0) notes.push(`Ignored unrecognised column(s): ${unknown.join(", ")}.`);

  const required = [
    ...BASE_REQUIRED_HEADERS,
    ...(lane === "HR_ENDORSEMENT" ? (["sourceReference"] as const) : []),
  ];
  for (const field of required) {
    const presentAlias = MEMBER_IMPORT_HEADER_ALIASES[field].some((alias) =>
      present.has(alias.toLowerCase()),
    );
    if (!presentAlias) {
      notes.push(`Missing required column "${field}" — every row will fail on this field.`);
    }
  }
  return notes;
}

function withinFileIdentity(rows: MemberImportRow[]): void {
  const firstById = new Map<string, MemberImportRow>();
  const firstByPhone = new Map<string, MemberImportRow>();
  const firstByEmail = new Map<string, MemberImportRow>();
  const firstByNameDob = new Map<string, MemberImportRow>();

  const candidate = (
    map: Map<string, MemberImportRow>,
    key: string,
    row: MemberImportRow,
    message: string,
  ) => {
    if (!key) return;
    const first = map.get(key);
    if (first) {
      appendWarning(first, message);
      appendWarning(row, message);
    } else map.set(key, row);
  };

  for (const row of rows) {
    // Rows that will not be written must not poison the verdict for a valid
    // row that happens to share one of their identifiers. Commit skips them,
    // so preview must classify the same set that commit can act on.
    if (row.error) continue;
    const id = row.idNumber ? normalizeNationalId(row.idNumber) : "";
    if (id) {
      if (firstById.has(id)) {
        appendError(row, "Duplicate of an earlier row in this file (same National ID).");
      } else firstById.set(id, row);
    }
    candidate(
      firstByPhone,
      row.phone ? normalizePhone(row.phone) ?? "" : "",
      row,
      MATCH_MESSAGE.PHONE,
    );
    candidate(
      firstByEmail,
      row.email ? normalizeEmail(row.email) : "",
      row,
      MATCH_MESSAGE.EMAIL,
    );
    candidate(
      firstByNameDob,
      `${normalizeLegalName(row.firstName)}|${normalizeLegalName(row.lastName)}|${row.dateOfBirth}`,
      row,
      MATCH_MESSAGE.NAME_DOB,
    );
  }
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function databaseIdentity(
  db: Pick<Prisma.TransactionClient, "member">,
  tenantId: string,
  rows: MemberImportRow[],
): Promise<void> {
  for (const part of chunks(rows.filter((row) => !row.error), 200)) {
    const filters: Prisma.MemberWhereInput[] = [];
    for (const row of part) {
      if (row.idNumber) filters.push({ nationalIdNormalized: normalizeNationalId(row.idNumber) });
      if (row.phone) filters.push({ phoneNormalized: normalizePhone(row.phone) });
      if (row.email) filters.push({ emailNormalized: normalizeEmail(row.email) });
      const dob = calendarDateToUtcDate(row.dateOfBirth);
      if (dob) {
        filters.push({
          firstName: { equals: row.firstName, mode: "insensitive" },
          lastName: { equals: row.lastName, mode: "insensitive" },
          dateOfBirth: dob,
        });
      }
    }
    if (filters.length === 0) continue;

    const existing = await db.member.findMany({
      where: { tenantId, OR: filters },
      select: {
        nationalIdNormalized: true,
        phoneNormalized: true,
        emailNormalized: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
      },
    });

    const ids = new Set(existing.flatMap((member) => member.nationalIdNormalized ?? []));
    const phones = new Set(existing.flatMap((member) => member.phoneNormalized ?? []));
    const emails = new Set(existing.flatMap((member) => member.emailNormalized ?? []));
    const names = new Set(
      existing.map(
        (member) =>
          `${normalizeLegalName(member.firstName)}|${normalizeLegalName(member.lastName)}|${calendarDateFromUtcDate(member.dateOfBirth)}`,
      ),
    );

    for (const row of part) {
      if (row.idNumber && ids.has(normalizeNationalId(row.idNumber))) {
        appendError(
          row,
          "This national ID is already recorded against another member in this tenant.",
        );
      }
      if (row.phone && phones.has(normalizePhone(row.phone) ?? "")) {
        appendWarning(row, MATCH_MESSAGE.PHONE);
      }
      if (row.email && emails.has(normalizeEmail(row.email))) {
        appendWarning(row, MATCH_MESSAGE.EMAIL);
      }
      const nameDob = `${normalizeLegalName(row.firstName)}|${normalizeLegalName(row.lastName)}|${row.dateOfBirth}`;
      if (names.has(nameDob)) appendWarning(row, MATCH_MESSAGE.NAME_DOB);
    }
  }
}

async function principalIntegrity(
  db: Pick<Prisma.TransactionClient, "member">,
  tenantId: string,
  groupId: string,
  rows: MemberImportRow[],
): Promise<void> {
  const inFile = new Set(
    rows
      .filter((row) => !row.error && row.relationship === "PRINCIPAL" && row.idNumber)
      .map((row) => normalizeNationalId(row.idNumber)),
  );
  const needed = [
    ...new Set(
      rows
        .filter(
          (row) =>
            !row.error &&
            row.relationship !== "PRINCIPAL" &&
            row.principalIdNumber &&
            !inFile.has(normalizeNationalId(row.principalIdNumber)),
        )
        .map((row) => normalizeNationalId(row.principalIdNumber)),
    ),
  ];
  if (needed.length === 0) return;

  const principals = await db.member.findMany({
    where: {
      tenantId,
      groupId,
      relationship: "PRINCIPAL",
      nationalIdNormalized: { in: needed },
    },
    select: { nationalIdNormalized: true, status: true },
  });
  const byId = new Map(
    principals
      .filter((principal) => principal.nationalIdNormalized)
      .map((principal) => [principal.nationalIdNormalized!, principal.status]),
  );

  for (const row of rows) {
    if (row.error || row.relationship === "PRINCIPAL" || !row.principalIdNumber) continue;
    const key = normalizeNationalId(row.principalIdNumber);
    if (inFile.has(key)) continue;
    const status = byId.get(key);
    if (!status) {
      appendError(row, "Principal National ID was not found in this group.");
      continue;
    }
    const verdict = canPerformMemberAction(status as MemberStatus, "ADD_DEPENDANT");
    if (!verdict.allowed) appendError(row, `${verdict.reason} ${verdict.nextAction}`);
  }
}

export async function preflightMemberImport(input: {
  db: Pick<Prisma.TransactionClient, "group" | "member">;
  tenantId: string;
  groupId: string;
  lane: MemberImportLane;
  rawRows: Record<string, unknown>[];
  effectiveDate?: Date;
}): Promise<MemberImportPreflight> {
  const group = await input.db.group.findFirst({
    where: { id: input.groupId, tenantId: input.tenantId },
    select: {
      id: true,
      name: true,
      status: true,
      packageId: true,
      packageVersionId: true,
      package: {
        select: { tenantId: true, status: true, maxAge: true, dependentMaxAge: true },
      },
      packageVersion: { select: { packageId: true, status: true } },
    },
  });
  if (!group) return { rows: [], validCount: 0, errorCount: 0, error: "Target group not found for your organisation." };
  if (group.status !== "ACTIVE") {
    return {
      rows: [],
      validCount: 0,
      errorCount: 0,
      error: `Members cannot be imported while the target group is ${group.status.toLowerCase()}.`,
    };
  }
  if (group.package.tenantId !== input.tenantId || group.package.status !== "ACTIVE") {
    return { rows: [], validCount: 0, errorCount: 0, error: "The target group's package is not active." };
  }
  if (
    !group.packageVersionId ||
    !group.packageVersion ||
    group.packageVersion.packageId !== group.packageId ||
    !["ACTIVE", "SUPERSEDED"].includes(group.packageVersion.status)
  ) {
    return {
      rows: [],
      validCount: 0,
      errorCount: 0,
      error: "The target group is not pinned to an approved package version.",
    };
  }

  const effectiveDate = input.effectiveDate
    ? calendarDateFromUtcDate(input.effectiveDate)
    : todayCalendarDate();
  if (!effectiveDate) {
    return {
      rows: [],
      validCount: 0,
      errorCount: 0,
      error: "The import effective date is invalid. Refresh the page and try again.",
    };
  }
  const asOf = calendarDateToUtcDate(effectiveDate)!;
  const rows = input.rawRows.map((raw, index) =>
    canonicalRow(raw, index + 2, input.lane, effectiveDate),
  );
  for (const row of rows) {
    if (row.error) continue;
    const age = checkEnrolmentAge(
      { relationship: row.relationship, dateOfBirth: row.dateOfBirth },
      asOf,
      group.package,
    );
    if (!age.ok) appendError(row, age.reason);
  }

  withinFileIdentity(rows);
  await databaseIdentity(input.db, input.tenantId, rows);
  await principalIntegrity(input.db, input.tenantId, input.groupId, rows);

  const validCount = rows.filter((row) => !row.error).length;
  return {
    rows,
    validCount,
    errorCount: rows.length - validCount,
    groupName: group.name,
  };
}

export function canonicalMemberImportContent(
  rows: MemberImportRow[],
  lane: MemberImportLane,
): string {
  return JSON.stringify(
    rows.map((row) => [
      row.firstName,
      row.lastName,
      row.idNumber,
      row.dateOfBirth,
      row.gender,
      row.phone,
      row.email,
      row.relationship,
      row.principalIdNumber,
      // Admin enrolment does not persist HR evidence. Excluding the unused
      // value prevents someone from changing that inert column to evade the
      // exact-file replay key for otherwise identical no-ID rows.
      lane === "HR_ENDORSEMENT" ? row.sourceReference : "",
    ]),
  );
}

function previewClaimContent(claim: MemberImportPreviewClaim): string {
  return JSON.stringify([
    1,
    claim.lane,
    claim.tenantId,
    claim.groupId,
    claim.effectiveDate,
    canonicalMemberImportContent(claim.rows, claim.lane),
    // Only the verdict matters here. Error copy may improve between preview and
    // confirm without changing whether the operator agreed to write the row.
    claim.rows.map((row) => Boolean(row.error)),
  ]);
}

function previewSigningSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Member import preview signing is not configured.");
  }
  return secret;
}

/**
 * Authenticate the server's preview verdict without persisting PII in a token.
 * The browser receives only this HMAC plus the already-rendered rows/date.
 */
export function createMemberImportPreviewToken(claim: MemberImportPreviewClaim): string {
  return createHmac("sha256", previewSigningSecret())
    .update(previewClaimContent(claim))
    .digest("hex");
}

export function verifyMemberImportPreviewToken(
  claim: MemberImportPreviewClaim,
  token: string,
): boolean {
  if (!/^[a-f0-9]{64}$/i.test(token)) return false;
  const expected = Buffer.from(createMemberImportPreviewToken(claim), "hex");
  const received = Buffer.from(token, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function todayMemberImportEffectiveDate(): Date {
  return calendarDateToUtcDate(todayCalendarDate())!;
}
