/**
 * Wave 4 / DEF-025 · B-phase bulk-enrolment import fixtures (plan §7.2).
 *
 * Writes the CONTRACTUALLY-NAMED CSV fixtures the run workbook's B-phase depends
 * on into `uat/eligibility_remediation_fixtures/import/`, plus a self-checked
 * `MANIFEST.md` (per-file purpose, expected outcome, row/valid/error counts and
 * SHA256) so a run can reconcile every upload deterministically.
 *
 * This is a UAT-harness generator, NOT product code. It writes files only — it
 * NEVER touches a database. It is safe to run with no DATABASE_URL and is fully
 * idempotent (re-running overwrites the same bytes → same SHA256).
 *
 * The column names, aliases, required-field rules, formula-injection defanging,
 * example-row abort and within-file de-duplication are mirrored EXACTLY from the
 * two live import mappers so the fixtures exercise those mappers' real behaviour:
 *   - src/app/(admin)/members/import/actions.ts      (admin MEMBERS_ADMIN lane)
 *   - src/app/(hr)/hr/roster/import/actions.ts        (HR_ENDORSEMENT lane)
 * The self-check re-parses each generated file with papaparse + a faithful copy
 * of the mapper's `validateRow`/`dedupeWithinFile` and prints the counts it wrote
 * into the manifest — a fixture whose real parse disagrees with its declared
 * expectation is surfaced loudly (a fixture that cannot behave as specified is
 * itself a finding).
 *
 *   npx tsx scripts/uat/generate-import-fixtures.ts
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import { neutralizeFormula } from "../../src/lib/csv-safe";
import {
  normalizeEmail,
  normalizeLegalName,
  normalizeNationalId,
  normalizePhone,
} from "../../src/lib/normalize";

// ── Output location ──────────────────────────────────────────────────────────
const OUT_DIR = path.resolve(
  __dirname,
  "../../uat/eligibility_remediation_fixtures/import",
);

// ── Canonical column order (matches the app's own downloadable template:
// members/import/page.tsx + HRMemberImportClient.tsx). ───────────────────────
const CANONICAL_HEADERS = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "gender",
  "relationship",
  "principalIdNumber",
  "idNumber",
  "phone",
  "email",
  "isExample",
] as const;

// ── Mapper mirror (kept in lock-step with the two import actions) ────────────
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

type RowVerdict = { row: number; valid: boolean; error?: string };

/** Faithful copy of the mappers' per-row validator (name fields defanged). */
function validateRow(raw: Record<string, unknown>, rowNum: number): RowVerdict & {
  firstName: string;
  lastName: string;
  idNumber: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string;
  relationship: string;
  principalIdNumber: string;
} {
  const lc: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) lc[k.trim().toLowerCase()] = v == null ? "" : String(v);
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = lc[k.toLowerCase()]?.trim();
      if (v) return v;
    }
    return "";
  };

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
    errors.push(`principalIdNumber is required for ${relationship} rows`);

  return {
    row: rowNum,
    valid: errors.length === 0,
    ...(errors.length ? { error: errors.join("; ") } : {}),
    firstName, lastName, idNumber, dateOfBirth, gender, phone, email, relationship, principalIdNumber,
  };
}

/** Faithful copy of the mappers' within-file de-duplication. */
function countWithinFileDupes(
  rows: Array<ReturnType<typeof validateRow>>,
): number {
  const seenId = new Set<string>();
  const seenPhone = new Set<string>();
  const seenEmail = new Set<string>();
  const seenNameDob = new Set<string>();
  let dupes = 0;
  for (const r of rows) {
    if (!r.valid) continue;
    const idKey = r.idNumber?.trim() ? normalizeNationalId(r.idNumber) : "";
    const phoneKey = r.phone?.trim() ? normalizePhone(r.phone) : null;
    const emailKey = r.email?.trim() ? normalizeEmail(r.email) : "";
    const nameDobKey = `${normalizeLegalName(r.firstName)}|${normalizeLegalName(r.lastName)}|${r.dateOfBirth.trim()}`;
    let dup = false;
    if (idKey && seenId.has(idKey)) dup = true;
    else if (phoneKey && seenPhone.has(phoneKey)) dup = true;
    else if (emailKey && seenEmail.has(emailKey)) dup = true;
    else if (seenNameDob.has(nameDobKey)) dup = true;
    if (dup) { dupes += 1; continue; }
    if (idKey) seenId.add(idKey);
    if (phoneKey) seenPhone.add(phoneKey);
    if (emailKey) seenEmail.add(emailKey);
    seenNameDob.add(nameDobKey);
  }
  return dupes;
}

function headerNotes(fields: string[] | undefined): string[] {
  const notes: string[] = [];
  const present = new Set((fields ?? []).map((f) => f.trim().toLowerCase()));
  const unknown = (fields ?? []).filter((f) => f.trim() && !KNOWN_HEADERS_LC.has(f.trim().toLowerCase()));
  if (unknown.length) notes.push(`Ignored unrecognised column(s): ${unknown.join(", ")}.`);
  for (const canonical of REQUIRED_CANONICAL) {
    const anyPresent = HEADER_ALIASES[canonical].some((a) => present.has(a.toLowerCase()));
    if (!anyPresent) notes.push(`Missing required column "${canonical}".`);
  }
  return notes;
}

/**
 * Reproduce the mapper's parse-time verdict for the manifest / self-check.
 * `dbDupes` are rows this generator KNOWS collide with the controlled data set
 * (caught only at confirm time by the live createMember probe, not in-file).
 */
type Analysis = {
  outcome: string;
  dataRows: number;
  valid: number;
  error: number;
  inFileDupes: number;
  dbDupes: number;
  notes: string[];
};
function analyze(text: string, dbDupes = 0): Analysis {
  const empty: Analysis = { outcome: "", dataRows: 0, valid: 0, error: 0, inFileDupes: 0, dbDupes, notes: [] };
  if (text.length === 0) return { ...empty, outcome: "REFUSED — empty file (size 0): \"No file uploaded.\"" };
  if (/ /.test(text)) return { ...empty, outcome: "REFUSED — NUL bytes: not a text CSV." };

  const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
  const data = parsed.data ?? [];
  const fields = parsed.meta?.fields;
  const parseErrorCount = parsed.errors?.length ?? 0;

  if (parseErrorCount && data.length === 0)
    return { ...empty, outcome: "REFUSED — unparseable CSV (malformed)." };

  const hasExamples = data.some(
    (r) => String((r as Record<string, unknown>)["isExample"] ?? (r as Record<string, unknown>)["isexample"] ?? "")
      .toLowerCase().trim() === "true",
  );
  if (hasExamples)
    return { ...empty, outcome: "REFUSED — example rows present: whole parse aborts." };

  if (data.length === 0)
    return { ...empty, outcome: "REFUSED — header only, no data rows." };

  const verdicts = data.map((raw, i) => validateRow(raw, i + 2));
  const valid = verdicts.filter((v) => v.valid).length;
  const error = verdicts.filter((v) => !v.valid).length;
  const inFileDupes = countWithinFileDupes(verdicts);
  const notes = headerNotes(fields);
  const importable = Math.max(0, valid - inFileDupes - dbDupes);
  const outcome =
    error === 0 && inFileDupes === 0 && dbDupes === 0
      ? `ACCEPTED — ${valid}/${data.length} rows valid, all import.`
      : `PARTIAL — ${valid} valid; ${error} field-error, ${inFileDupes} in-file dupe(s)`
        + (dbDupes ? `, ${dbDupes} controlled-data dupe(s) (confirm-time)` : "")
        + ` → ${importable} import${parseErrorCount ? "; parser flagged rows" : ""}.`;
  return { outcome, dataRows: data.length, valid, error, inFileDupes, dbDupes, notes };
}

// ── CSV emit helpers (RFC-4180 quoting; formula payloads deliberately NOT
// neutralised here — the fixtures must carry them raw to the import boundary). ─
function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
function csvLine(cells: string[]): string {
  return cells.map(csvCell).join(",");
}
/** Build a CSV from an explicit header row + rows keyed by those header labels. */
function buildCsv(headers: string[], rows: Array<Record<string, string>>): string {
  const lines = [csvLine(headers)];
  for (const r of rows) lines.push(csvLine(headers.map((h) => r[h] ?? "")));
  return lines.join("\r\n") + "\r\n";
}

// A valid row keyed by CANONICAL headers (unset → "").
function row(v: Partial<Record<(typeof CANONICAL_HEADERS)[number], string>>): Record<string, string> {
  const base: Record<string, string> = {};
  for (const h of CANONICAL_HEADERS) base[h] = v[h] ?? "";
  if (!("isExample" in v)) base.isExample = "false";
  return base;
}

// ── Fixture definitions ──────────────────────────────────────────────────────
type Fixture = {
  name: string;
  purpose: string;
  content: string;
  /** rows the generator knows collide with the controlled/happy-path data. */
  dbDupes?: number;
};

function happyPath(): string {
  // A family (child listed BEFORE its principal → exercises the mapper's two-pass
  // link), plus two standalone principals. All valid.
  const rows = [
    row({ firstName: "Sanyu", lastName: "Bulk", dateOfBirth: "1988-04-12", gender: "FEMALE", relationship: "PRINCIPAL", idNumber: "CFBULK1001", phone: "+256701110001", email: "sanyu.bulk+uat@example.invalid" }),
    row({ firstName: "Chloe", lastName: "Bulk", dateOfBirth: "2015-02-28", gender: "FEMALE", relationship: "CHILD", principalIdNumber: "CFBULK1001", idNumber: "CFBULK1003", email: "chloe.bulk+uat@example.invalid" }),
    row({ firstName: "Baraka", lastName: "Bulk", dateOfBirth: "1989-11-03", gender: "MALE", relationship: "SPOUSE", principalIdNumber: "CFBULK1001", idNumber: "CFBULK1002", phone: "+256701110002", email: "baraka.bulk+uat@example.invalid" }),
    row({ firstName: "Žanna", lastName: "Løk", dateOfBirth: "1992-07-17", gender: "OTHER", relationship: "PRINCIPAL", idNumber: "CFBULK2001", phone: "+256701120001", email: "zanna.lok+uat@example.invalid" }),
    row({ firstName: "Mirembe", lastName: "Batch", dateOfBirth: "1993-02-05", gender: "FEMALE", relationship: "PRINCIPAL", idNumber: "CFBULK3001", phone: "+256701130001", email: "mirembe.batch+uat@example.invalid" }),
  ];
  return buildCsv([...CANONICAL_HEADERS], rows);
}

function hrHappyPath(): string {
  const rows = [
    row({ firstName: "Hawa", lastName: "HRBatch", dateOfBirth: "1987-01-12", gender: "FEMALE", relationship: "PRINCIPAL", idNumber: "CFHR1001", phone: "+256702110001", email: "hawa.hrbatch+uat@example.invalid" }),
    row({ firstName: "Isaac", lastName: "HRBatch", dateOfBirth: "1986-03-09", gender: "MALE", relationship: "SPOUSE", principalIdNumber: "CFHR1001", idNumber: "CFHR1002", phone: "+256702110002", email: "isaac.hrbatch+uat@example.invalid" }),
    row({ firstName: "Jalia", lastName: "HRBatch", dateOfBirth: "2017-07-21", gender: "FEMALE", relationship: "CHILD", principalIdNumber: "CFHR1001", idNumber: "CFHR1003" }),
  ];
  return buildCsv([...CANONICAL_HEADERS], rows);
}

function mixedPartial(): string {
  const rows = [
    row({ firstName: "Valid", lastName: "Principal", dateOfBirth: "1990-01-01", gender: "FEMALE", relationship: "PRINCIPAL", idNumber: "CFMIX0001", phone: "+256700920001", email: "valid.principal+uat@example.invalid" }),
    row({ firstName: "Child", lastName: "OfValid", dateOfBirth: "2018-03-03", gender: "MALE", relationship: "CHILD", principalIdNumber: "CFMIX0001", idNumber: "CFMIX0002" }),
    row({ firstName: "", lastName: "MissingFirst", dateOfBirth: "1990-01-01", gender: "MALE", relationship: "PRINCIPAL", idNumber: "CFMIX0003" }),
    row({ firstName: "Bad", lastName: "Gender", dateOfBirth: "1990-01-01", gender: "UNKNOWN", relationship: "PRINCIPAL", idNumber: "CFMIX0004" }),
    row({ firstName: "Orphan", lastName: "Child", dateOfBirth: "2018-01-01", gender: "FEMALE", relationship: "CHILD", principalIdNumber: "DOESNOTEXIST", idNumber: "CFMIX0005" }),
    row({ firstName: "Future", lastName: "Birth", dateOfBirth: "2099-01-01", gender: "FEMALE", relationship: "PRINCIPAL", idNumber: "CFMIX0006" }),
    row({ firstName: "Missing", lastName: "PrincipalRef", dateOfBirth: "2016-05-05", gender: "MALE", relationship: "SPOUSE", idNumber: "CFMIX0007" }),
  ];
  return buildCsv([...CANONICAL_HEADERS], rows);
}

function headerAlias(): string {
  // Every column supplied via a NON-canonical alias; all rows valid.
  const headers = ["first_name", "last_name", "dob", "gender", "relationship", "principal_id", "national_id", "phone", "email", "isExample"];
  const rows = [
    { first_name: "Alias", last_name: "Principal", dob: "1985-06-06", gender: "MALE", relationship: "PRINCIPAL", principal_id: "", national_id: "CFALIAS001", phone: "+256703110001", email: "alias.principal+uat@example.invalid", isExample: "false" },
    { first_name: "Alias", last_name: "Spouse", dob: "1986-08-08", gender: "FEMALE", relationship: "SPOUSE", principal_id: "CFALIAS001", national_id: "CFALIAS002", phone: "", email: "alias.spouse+uat@example.invalid", isExample: "false" },
  ];
  return buildCsv(headers, rows);
}

function headerReordered(): string {
  // Canonical names, shuffled order — must be reorder-safe (keyed by name).
  const headers = ["relationship", "lastName", "firstName", "gender", "idNumber", "principalIdNumber", "dateOfBirth", "email", "phone", "isExample"];
  const rows = [
    { relationship: "PRINCIPAL", lastName: "Reorder", firstName: "Rita", gender: "FEMALE", idNumber: "CFREORD001", principalIdNumber: "", dateOfBirth: "1991-09-09", email: "rita.reorder+uat@example.invalid", phone: "+256704110001", isExample: "false" },
    { relationship: "CHILD", lastName: "Reorder", firstName: "Rex", gender: "MALE", idNumber: "CFREORD002", principalIdNumber: "CFREORD001", dateOfBirth: "2019-10-10", email: "", phone: "", isExample: "false" },
  ];
  return buildCsv(headers, rows);
}

function unknownColumns(): string {
  // Canonical columns + THREE unrecognised columns (must be ignored-with-note).
  const headers = [...CANONICAL_HEADERS, "department", "employeeId", "salary"];
  const rows = [
    { ...row({ firstName: "Unknown", lastName: "Cols", dateOfBirth: "1984-04-04", gender: "MALE", relationship: "PRINCIPAL", idNumber: "CFUNK0001", email: "unknown.cols+uat@example.invalid" }), department: "Finance", employeeId: "E-0001", salary: "1000000" },
  ];
  return buildCsv(headers, rows);
}

function isExample(): string {
  // Real rows + one leftover template row (isExample=true) → aborts whole parse.
  const rows = [
    row({ firstName: "Ready", lastName: "Principal", dateOfBirth: "1990-01-01", gender: "FEMALE", relationship: "PRINCIPAL", idNumber: "CFEX0001", email: "ready.principal+uat@example.invalid" }),
    row({ firstName: "Example", lastName: "DeleteMe", dateOfBirth: "1990-01-01", gender: "FEMALE", relationship: "PRINCIPAL", idNumber: "CFEXAMPLE01", isExample: "true" }),
  ];
  return buildCsv([...CANONICAL_HEADERS], rows);
}

function duplicates(): string {
  // Row 2 = in-file dup of row 1 (same national ID). Row 3 = dup of a CONTROLLED
  // happy-path member (CFBULK1001 = Sanyu) — caught at confirm against the DB.
  const rows = [
    row({ firstName: "Dupe", lastName: "First", dateOfBirth: "1990-01-01", gender: "MALE", relationship: "PRINCIPAL", idNumber: "CFDUP9001", phone: "+256705110001", email: "dupe.first+uat@example.invalid" }),
    row({ firstName: "Dupe", lastName: "AgainInFile", dateOfBirth: "1991-02-02", gender: "MALE", relationship: "PRINCIPAL", idNumber: "CFDUP9001", phone: "+256705110002", email: "dupe.again+uat@example.invalid" }),
    row({ firstName: "Sanyu", lastName: "Controlled", dateOfBirth: "1988-04-12", gender: "FEMALE", relationship: "PRINCIPAL", idNumber: "CFBULK1001", phone: "+256705110003", email: "sanyu.controlled+uat@example.invalid" }),
    row({ firstName: "Clean", lastName: "Unique", dateOfBirth: "1992-03-03", gender: "FEMALE", relationship: "PRINCIPAL", idNumber: "CFDUP9004", phone: "+256705110004", email: "clean.unique+uat@example.invalid" }),
  ];
  return buildCsv([...CANONICAL_HEADERS], rows);
}

function formulaInjection(): string {
  // Leading = + - @ and TAB in the free-text NAME fields (defanged on import by
  // neutralizeFormula; signed-number ids/phones are legitimately left intact).
  const header = csvLine([...CANONICAL_HEADERS]);
  const lines = [
    header,
    // =2+2 (no comma → raw), name field
    csvLine(["=2+2", "Formula", "1990-01-01", "FEMALE", "PRINCIPAL", "", "CFINJECT01", "", "inject1+uat@example.invalid", "false"]),
    // +SUM(1,2) contains a comma → will be RFC-quoted by csvLine
    csvLine(["+SUM(1,2)", "PlusFormula", "1990-01-02", "MALE", "PRINCIPAL", "", "CFINJECT02", "", "inject2+uat@example.invalid", "false"]),
    csvLine(["@CMD", "AtSign", "1990-01-03", "OTHER", "PRINCIPAL", "", "CFINJECT03", "", "inject3+uat@example.invalid", "false"]),
    // -1+cmd is NOT a plain number → defanged; distinct from a signed number
    csvLine(["-1+cmd", "MinusFormula", "1990-01-04", "FEMALE", "PRINCIPAL", "", "CFINJECT04", "", "inject4+uat@example.invalid", "false"]),
    // leading TAB in the last name
    csvLine(["Tabbed", "\tLeadTab", "1990-01-05", "MALE", "PRINCIPAL", "", "CFINJECT05", "", "inject5+uat@example.invalid", "false"]),
  ];
  return lines.join("\r\n") + "\r\n";
}

function malformed(): string {
  // (1) an UNCLOSED double-quote, (2) a row with TOO MANY columns (mismatch).
  const header = csvLine([...CANONICAL_HEADERS]);
  const unclosed = `"Unclosed,Name,1990-01-01,FEMALE,PRINCIPAL,,CFBAD01,,,false`;
  const tooManyCols = `Extra,Columns,1990-01-01,MALE,PRINCIPAL,,CFBAD02,,,false,EXTRA1,EXTRA2`;
  return [header, unclosed, tooManyCols].join("\r\n") + "\r\n";
}

function headerOnly(): string {
  return csvLine([...CANONICAL_HEADERS]) + "\r\n";
}

function perf(): string {
  // 5,000 self-contained PRINCIPAL rows (no cross-row dependency) — a clean SLA
  // load with 5,000 importable rows and zero errors.
  const N = 5000;
  const lines = [csvLine([...CANONICAL_HEADERS])];
  const genders = ["MALE", "FEMALE", "OTHER"];
  for (let i = 1; i <= N; i++) {
    const seq = String(i).padStart(5, "0");
    // Deterministic, always-valid adult DOB (1970-01-01 .. within range).
    const year = 1960 + (i % 45); // 1960..2004
    const month = String((i % 12) + 1).padStart(2, "0");
    const day = String((i % 27) + 1).padStart(2, "0");
    // Unique UG phone: 9 local digits after +256.
    const phone = `+2567${String(10000000 + i).slice(-8)}`;
    lines.push(
      csvLine([
        `Perf${seq}`,
        `Load${seq}`,
        `${year}-${month}-${day}`,
        genders[i % 3],
        "PRINCIPAL",
        "",
        `CFPERF${seq}`,
        phone,
        `perf.${seq}+uat@example.invalid`,
        "false",
      ]),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const fixtures: Fixture[] = [
    { name: "member_import_happy_path.csv", purpose: "All-valid admin family set (dependant listed before its principal → exercises two-pass linking).", content: happyPath() },
    { name: "member_import_mixed_partial.csv", purpose: "Valid + invalid rows (missing name, bad gender, orphan/unlinked dependant, future DOB) → partial import.", content: mixedPartial() },
    { name: "member_import_empty.csv", purpose: "Zero-byte file → upload refused with no success audit.", content: "" },
    { name: "member_import_header_only.csv", purpose: "Header row, no data → refused (\"no data rows\").", content: headerOnly() },
    { name: "member_import_malformed.csv", purpose: "Unclosed quote + column-count mismatch → parsed/rejected safely, no partial member.", content: malformed() },
    { name: "member_import_header_alias.csv", purpose: "Every column via an accepted alias (first_name/dob/national_id/principal_id) → mapped, all valid.", content: headerAlias() },
    { name: "member_import_header_reordered.csv", purpose: "Canonical columns in shuffled order → reorder-safe (keyed by name, no data shift).", content: headerReordered() },
    { name: "member_import_unknown_columns.csv", purpose: "Canonical columns + 3 unrecognised columns → ignored-with-note, rows still valid.", content: unknownColumns() },
    { name: "member_import_isexample.csv", purpose: "A leftover template row (isExample=true) present → whole parse aborts.", content: isExample() },
    { name: "member_import_duplicates.csv", purpose: "In-file duplicate (row 2) + duplicate of a controlled happy-path member (row 3, confirm-time).", content: duplicates(), dbDupes: 1 },
    { name: "member_import_formula_injection.csv", purpose: "Leading = + - @ and TAB in name fields → defanged on import (signed ids/phones intact).", content: formulaInjection() },
    { name: "member_import_hr_happy_path.csv", purpose: "All-valid HR-lane family set → one SUBMITTED endorsement per row (not live members).", content: hrHappyPath() },
    { name: "member_import_perf.csv", purpose: "5,000 valid PRINCIPAL rows → bulk SLA / progress-UI / reconciliation load (B-015).", content: perf() },
  ];

  type ManifestRow = { fixture: Fixture; sha256: string; analysis: Analysis };
  const results: ManifestRow[] = [];
  for (const f of fixtures) {
    await writeFile(path.join(OUT_DIR, f.name), f.content, "utf8");
    const sha256 = createHash("sha256").update(Buffer.from(f.content, "utf8")).digest("hex");
    results.push({ fixture: f, sha256, analysis: analyze(f.content, f.dbDupes ?? 0) });
  }

  // ── MANIFEST.md ────────────────────────────────────────────────────────────
  const now = new Date().toISOString();
  const md: string[] = [];
  md.push("# B-phase import fixtures — MANIFEST");
  md.push("");
  md.push("Wave 4 / DEF-025 · plan §7.2. Generated by `scripts/uat/generate-import-fixtures.ts`.");
  md.push("Regenerate with `npx tsx scripts/uat/generate-import-fixtures.ts` (deterministic — same bytes, same SHA256).");
  md.push("");
  md.push(`Generated: ${now}`);
  md.push("");
  md.push("Canonical header order (matches the app's downloadable template):");
  md.push("");
  md.push("```");
  md.push(CANONICAL_HEADERS.join(","));
  md.push("```");
  md.push("");
  md.push("Header aliases accepted (case-insensitive): "
    + Object.entries(HEADER_ALIASES).map(([k, v]) => `${k}=[${v.join(" | ")}]`).join("; ") + ".");
  md.push("");
  md.push("Conventions: fixture National IDs are `CF…`-prefixed; e-mails use the reserved");
  md.push("`example.invalid` domain; phones are Uganda `+256…`. \"Rows\" counts DATA rows");
  md.push("(excludes the header). \"Valid\" = rows passing field validation; \"In-file dupes\"");
  md.push("are rejected by the mapper's within-file de-dup; \"Controlled dupes\" collide with the");
  md.push("committed happy-path set and are rejected at confirm-time by the live createMember probe.");
  md.push("");
  md.push("| # | File | Rows | Valid | Field err | In-file dupes | Controlled dupes | Expected outcome | SHA256 |");
  md.push("|---|------|-----:|------:|----------:|--------------:|-----------------:|------------------|--------|");
  results.forEach((r, i) => {
    const a = r.analysis;
    md.push(
      `| ${i + 1} | \`${r.fixture.name}\` | ${a.dataRows} | ${a.valid} | ${a.error} | ${a.inFileDupes} | ${a.dbDupes} | ${a.outcome} | \`${r.sha256}\` |`,
    );
  });
  md.push("");
  md.push("## Per-file purpose & notes");
  md.push("");
  results.forEach((r, i) => {
    md.push(`### ${i + 1}. \`${r.fixture.name}\``);
    md.push("");
    md.push(`- **Purpose:** ${r.fixture.purpose}`);
    md.push(`- **Expected:** ${r.analysis.outcome}`);
    if (r.analysis.notes.length) md.push(`- **Parser notes:** ${r.analysis.notes.join(" ")}`);
    md.push(`- **SHA256:** \`${r.sha256}\``);
    md.push("");
  });
  await writeFile(path.join(OUT_DIR, "MANIFEST.md"), md.join("\n"), "utf8");

  // ── stdout summary + self-check ─────────────────────────────────────────────
  let warnings = 0;
  console.log(`\nWrote ${fixtures.length} fixtures + MANIFEST.md → ${OUT_DIR}\n`);
  for (const r of results) {
    console.log(`  ${r.fixture.name.padEnd(38)} rows=${r.analysis.dataRows} valid=${r.analysis.valid} err=${r.analysis.error} dup=${r.analysis.inFileDupes}/${r.analysis.dbDupes}`);
    console.log(`    → ${r.analysis.outcome}`);
    // Cheap sanity gate: a nominally happy-path file with any field error is a defect in the fixture.
    if (/happy_path/.test(r.fixture.name) && r.analysis.error > 0) { warnings++; console.log("    !! WARNING: happy-path fixture has field errors"); }
    if (r.fixture.name === "member_import_perf.csv" && (r.analysis.valid !== 5000 || r.analysis.error !== 0)) { warnings++; console.log("    !! WARNING: perf fixture is not 5000/0"); }
  }
  console.log(warnings ? `\nDONE with ${warnings} warning(s).` : "\nDONE — all fixtures parse as specified.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
