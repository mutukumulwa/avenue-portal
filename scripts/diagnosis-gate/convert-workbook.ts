/**
 * convert-workbook.ts — Diagnosis Gate C1.3
 *
 * Converts a clinical-team workbook into a canonical protocol pack (pack.json) plus a
 * validation report. Offline and deterministic: the same workbook always produces a
 * byte-identical pack, so packs diff cleanly in git and can be checksummed.
 *
 * WHAT THIS TOOL REFUSES TO DO (plan §0.2 / DG-D7) — this is the point of it:
 *   • It will not invent a group code. If the workbook has no code column, the codes it
 *     assigns are provisional and it says so as a blocking error, because provisional
 *     codes shift the moment a row is inserted.
 *   • It will not spell-correct or synonym-match a condition name. Names that differ
 *     only in case/punctuation are matched; "Tonsilitis"→"Tonsillitis" is NOT, because
 *     that is a content decision. Unmatched names are reported, never guessed.
 *   • It will not infer which test confirms which diagnosis from prose. It proposes
 *     candidates for clinical confirmation and leaves the pack's confirmatory links
 *     empty until a machine-readable column exists.
 *   • It will not decide that a condition is a catch-all. It proposes candidates by an
 *     explicitly stated, transparent measure and leaves the flag unset.
 *
 * Usage:
 *   npx tsx scripts/diagnosis-gate/convert-workbook.ts \
 *     --in  docs/diagnosis-gate/source/ICD11_Codes_Mapped_with_Clinical_Features_v0.xlsx \
 *     --out docs/diagnosis-gate/source/pack-v0.json \
 *     --report docs/diagnosis-gate/reports/v0-validation.md \
 *     [--aliases <name-aliases.json>]   # clinical-team-confirmed name variants
 *     [--proposals docs/diagnosis-gate/reports/v0-proposals.md]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, basename } from "node:path";
import * as XLSX from "@e965/xlsx";
import {
  type ProtocolPack,
  type PackGroup,
  type PackMembership,
  type PackLabRule,
  type PackLink,
  type PackAlias,
  PACK_FORMAT_VERSION,
  normaliseAliasValue,
  normaliseCode,
  looseNameKey,
  serialisePack,
} from "@/server/services/diagnosis-gate/pack-types";
import { validatePack, renderValidationMarkdown, type ValidationIssue } from "@/server/services/diagnosis-gate/pack-validate";

// ── Sheet names, exactly as they appear (note the trailing space on one) ─────
const SHEET = {
  icd11Master: "ICD11 Codes",
  commonest: "Commonest",
  mapping: "Diagnoses Mapped to ICD",
  features: "Clinical Diagnostic Features ",
  labs: "Commonest Labs Rationale",
} as const;

/**
 * Groups whose membership breadth suggests a category rather than a diagnosis. Stated
 * explicitly so the measure is auditable; used ONLY to propose, never to set the flag.
 */
const CATCH_ALL_PROPOSAL_THRESHOLD = 40;

// ── v0.1 "research remediation" annex (C7.4) ─────────────────────────────────
// A remediated workbook keeps the original sheets untouched and adds parallel annex
// sheets carrying stable codes, an alias table, and resolved lab links. When they are
// present the converter reads them INSTEAD of guessing — but only the rows whose status
// says a human has settled them (DG-D16). Everything still pending is reported, never
// imported, however confidently it is written.
const ANNEX = {
  conditions: "Conditions v0.1",
  aliases: "Name Aliases v0.1",
  labRules: "Lab Rules v0.1",
  sources: "Source Register",
} as const;

/**
 * Alias statuses safe to import: a deterministic spelling/spacing normalisation, or a
 * name preserved unchanged. `SCOPE_REVIEW_REQUIRED` — e.g. "Acne" vs "Acne Vulgaris" —
 * is a CLINICAL judgement about whether two labels mean the same condition, and is
 * excluded until a clinician says otherwise.
 */
const ACCEPTED_ALIAS_STATUSES = new Set(["DETERMINISTIC_NORMALIZATION", "PRESERVED"]);

/** A confirmatory link imports only once a human has signed it off. */
const APPROVED_STATUS_MARKERS = ["APPROVED", "SIGNED_OFF", "CONFIRMED"];
function isApprovedStatus(v: string): boolean {
  const s = v.trim().toUpperCase();
  if (!s) return false;
  // "PENDING…" / "…PENDING_CLINICAL_SIGNOFF" must never read as approved.
  if (s.includes("PENDING") || s.includes("CANDIDATE") || s.includes("PROPOSED")) return false;
  return APPROVED_STATUS_MARKERS.some((m) => s.includes(m));
}

interface AnnexGroup { groupCode: string; canonicalName: string; originalName: string; isCatchAll: boolean; sourceRow: string }
interface AnnexLabRule { testCode: string; supportedGroupCodes: string[]; confirmatoryGroup: string | null; confirmatoryApproved: boolean; confirmatoryStatus: string; providerMessage: string }
interface Annex {
  groups: AnnexGroup[];
  /** looseName → groupCode, from canonical + original names + accepted aliases. */
  nameIndex: Map<string, string>;
  labRules: Map<string, AnnexLabRule>;
  icdRelease?: string;
  pendingAliases: Array<{ alias: string; groupCode: string; status: string }>;
  confirmatoryProposals: Array<{ testCode: string; groupCode: string; status: string }>;
}

/**
 * READER NOTE (C7.3). This tool originally used `exceljs`, which cannot open workbooks
 * written by openpyxl — the v0.1 annex failed with "Cannot read properties of undefined
 * (reading 'sheets')". Root cause: openpyxl emits namespace-PREFIXED elements
 * (`<x:workbook>`) where exceljs's SAX parsers only match the unprefixed form. Stripping
 * the prefix across all 30 XML parts got past that error and straight into the next one,
 * so the incompatibility is deeper than namespaces and not worth hand-patching.
 *
 * SheetJS reads both files with full fidelity — including v0's trailing-space sheet name,
 * which this converter depends on. It is a **devDependency used only by this offline CLI**:
 * the server never parses xlsx (the admin screen imports the pack.json this tool emits),
 * so the runtime dependency posture is unchanged. `exceljs` remains a dependency for the
 * five production files that use it; nothing about them changed.
 *
 * Provenance caveat, stated rather than buried: `@e965/xlsx` is a community republish of
 * SheetJS on npm, because SheetJS itself distributes from its own CDN and the `xlsx` name
 * on npm is frozen at a stale 0.18.5 with known advisories. Version is pinned. If you
 * prefer the vendor artifact, swap to
 * `npm i -D https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` — the import site is this
 * one file.
 */
type Cell = string | number | boolean | Date | null | undefined;

/** Flatten a cell to text. Kept defensive so any reader shape degrades gracefully. */
function cellText(v: Cell): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as Array<{ text: string }>).map((r) => r.text).join("").trim();
    if (typeof o.text === "string") return o.text.trim();
    if ("result" in o) return cellText(o.result as Cell);
    if ("v" in o) return cellText(o.v as Cell);
    if ("hyperlink" in o && typeof o.hyperlink === "string") return o.hyperlink.trim();
  }
  return String(v).trim();
}

/**
 * A sheet presented with the tiny 1-based accessor surface the parsing code below already
 * used, so swapping the reader changed no parsing logic — which is what makes the
 * byte-identical v0 output a meaningful regression gate.
 */
interface Sheet {
  name: string;
  rowCount: number;
  colCount: number;
  getRow(row: number): { getCell(col: number): { value: Cell } };
}

interface Workbook {
  sheetNames: string[];
  sheet(name: string): Sheet | undefined;
}

function loadWorkbook(path: string): Workbook {
  // Read the bytes ourselves rather than using XLSX.readFile: SheetJS resolves `fs`
  // through an internal shim that is not present in every module environment (it is
  // absent under vitest), and a reader that works in the CLI but not in tests is a
  // reader whose guard tests cannot run.
  const wb = XLSX.read(readFileSync(path), { type: "buffer", cellDates: true });
  const cache = new Map<string, Sheet>();
  const build = (name: string): Sheet => {
    const raw = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
    const colCount = raw.reduce((m, r) => Math.max(m, r?.length ?? 0), 0);
    return {
      name,
      rowCount: raw.length,
      colCount,
      getRow: (row) => ({ getCell: (col) => ({ value: raw[row - 1]?.[col - 1] ?? null }) }),
    };
  };
  return {
    sheetNames: wb.SheetNames,
    sheet: (name) => {
      if (!wb.Sheets[name]) return undefined;
      let s = cache.get(name);
      if (!s) { s = build(name); cache.set(name, s); }
      return s;
    },
  };
}

function getSheet(wb: Workbook, name: string): Sheet {
  const exact = wb.sheet(name);
  if (exact) return exact;
  // The v0 workbook has a sheet whose name carries a TRAILING SPACE; tolerate that in
  // both directions rather than making callers guess.
  const looseName = wb.sheetNames.find((n) => n.trim() === name.trim());
  const loose = looseName ? wb.sheet(looseName) : undefined;
  if (loose) return loose;
  throw new Error(`Worksheet "${name}" not found. Available: ${wb.sheetNames.map((n) => `"${n}"`).join(", ")}`);
}

/** Map header text → 1-based column index for a sheet whose `headerRow` holds headers. */
function headerIndex(ws: Sheet, headerRow: number): Map<string, number> {
  const idx = new Map<string, number>();
  const row = ws.getRow(headerRow);
  for (let c = 1; c <= ws.colCount; c += 1) {
    const t = cellText(row.getCell(c).value);
    if (t) idx.set(t.trim().toLowerCase(), c);
  }
  return idx;
}

function col(idx: Map<string, number>, ...candidates: string[]): number | undefined {
  for (const c of candidates) {
    const hit = idx.get(c.toLowerCase());
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Read the v0.1 annex sheets, if this workbook has them.
 *
 * Returns null for a plain (non-remediated) workbook, so the legacy path is untouched —
 * which is what keeps `pack-v0.json` byte-identical.
 */
function readAnnex(wb: Workbook, issue: (code: string, message: string, where?: string) => void): Annex | null {
  if (!wb.sheetNames.includes(ANNEX.conditions)) return null;

  const groups: AnnexGroup[] = [];
  const nameIndex = new Map<string, string>();
  const pendingAliases: Annex["pendingAliases"] = [];
  const labRules = new Map<string, AnnexLabRule>();
  const confirmatoryProposals: Annex["confirmatoryProposals"] = [];

  // ── Conditions: stable codes at last (the F1 ask) ──────────────────────────
  {
    const ws = getSheet(wb, ANNEX.conditions);
    const idx = headerIndex(ws, 1);
    const c = {
      code: col(idx, "group_code", "group code"),
      canonical: col(idx, "canonical_name", "canonical name"),
      original: col(idx, "original_v0_name", "original v0 name"),
      catchAll: col(idx, "proposed_is_catch_all", "is_catch_all"),
    };
    if (!c.code || !c.canonical) {
      issue("ANNEX_CONDITIONS_COLUMNS_MISSING", `"${ANNEX.conditions}" is missing Group_Code or Canonical_Name — the annex cannot be used.`, ANNEX.conditions);
      return null;
    }
    const seen = new Set<string>();
    for (let r = 2; r <= ws.rowCount; r += 1) {
      const row = ws.getRow(r);
      const groupCode = cellText(row.getCell(c.code).value);
      const canonicalName = cellText(row.getCell(c.canonical).value);
      if (!groupCode || !canonicalName) continue;
      if (seen.has(groupCode)) {
        issue("ANNEX_DUPLICATE_GROUP_CODE", `Group code "${groupCode}" appears more than once on ${ANNEX.conditions}.`, `${ANNEX.conditions}!A${r}`);
        continue;
      }
      seen.add(groupCode);
      const originalName = c.original ? cellText(row.getCell(c.original).value) : "";
      // A catch-all imports in the SAFE direction: flagged true bars it from live routing
      // forever (DG-D8), so accepting the proposal can only ever restrict, never widen.
      const isCatchAll = c.catchAll ? /^(true|yes|y|1)$/i.test(cellText(row.getCell(c.catchAll).value)) : false;
      groups.push({ groupCode, canonicalName, originalName, isCatchAll, sourceRow: `${ANNEX.conditions}!A${r}` });
      nameIndex.set(looseNameKey(canonicalName), groupCode);
      if (originalName) nameIndex.set(looseNameKey(originalName), groupCode);
    }
  }

  // ── Name aliases: status-gated (DG-D16) ───────────────────────────────────
  if (wb.sheetNames.includes(ANNEX.aliases)) {
    const ws = getSheet(wb, ANNEX.aliases);
    const idx = headerIndex(ws, 1);
    const c = { alias: col(idx, "alias"), code: col(idx, "group_code", "group code"), status: col(idx, "resolution_status", "resolution status") };
    if (c.alias && c.code) {
      for (let r = 2; r <= ws.rowCount; r += 1) {
        const row = ws.getRow(r);
        const alias = cellText(row.getCell(c.alias).value);
        const groupCode = cellText(row.getCell(c.code).value);
        const status = c.status ? cellText(row.getCell(c.status).value).toUpperCase() : "";
        if (!alias || !groupCode) continue;
        if (!ACCEPTED_ALIAS_STATUSES.has(status)) {
          // Reported, never imported: deciding two labels mean one condition is clinical.
          pendingAliases.push({ alias, groupCode, status: status || "(no status)" });
          continue;
        }
        nameIndex.set(looseNameKey(alias), groupCode);
      }
    }
  }

  // ── Lab rules: resolved links + provider-safe wording ──────────────────────
  if (wb.sheetNames.includes(ANNEX.labRules)) {
    const ws = getSheet(wb, ANNEX.labRules);
    const idx = headerIndex(ws, 1);
    const c = {
      id: col(idx, "test_id", "test id"),
      supported: col(idx, "supported_group_codes_auto"),
      confirmatory: col(idx, "proposed_confirmatory_group"),
      confirmatoryStatus: col(idx, "confirmatory_status"),
      approval: col(idx, "clinical_approval_status"),
      message: col(idx, "provider_message_v0_1", "provider_message"),
    };
    if (c.id) {
      for (let r = 2; r <= ws.rowCount; r += 1) {
        const row = ws.getRow(r);
        const testCode = cellText(row.getCell(c.id).value);
        if (!testCode) continue;
        const supported = c.supported
          ? cellText(row.getCell(c.supported).value).split(/[;,]/).map((x) => x.trim()).filter(Boolean)
          : [];
        const confirmatoryGroup = c.confirmatory ? cellText(row.getCell(c.confirmatory).value) || null : null;
        const confirmatoryStatus = c.confirmatoryStatus ? cellText(row.getCell(c.confirmatoryStatus).value) : "";
        const approval = c.approval ? cellText(row.getCell(c.approval).value) : "";
        // BOTH statuses must read as approved — a confirmatory candidate is clinical
        // content, and "AUTHORITATIVE_CANDIDATE_PENDING_CLINICAL_SIGNOFF" is not a signature.
        const confirmatoryApproved = !!confirmatoryGroup && isApprovedStatus(confirmatoryStatus) && isApprovedStatus(approval);
        if (confirmatoryGroup && !confirmatoryApproved) {
          confirmatoryProposals.push({ testCode, groupCode: confirmatoryGroup, status: confirmatoryStatus || approval || "(no status)" });
        }
        labRules.set(testCode, {
          testCode,
          supportedGroupCodes: supported,
          confirmatoryGroup,
          confirmatoryApproved,
          confirmatoryStatus,
          providerMessage: c.message ? cellText(row.getCell(c.message).value) : "",
        });
      }
    }
  }

  // ── ICD release target (DG-D18): recorded as a target, not a validation claim ──
  let icdRelease: string | undefined;
  if (wb.sheetNames.includes(ANNEX.sources)) {
    const ws = getSheet(wb, ANNEX.sources);
    const idx = headerIndex(ws, 1);
    const c = { id: col(idx, "source_id"), version: col(idx, "version_or_date") };
    if (c.id && c.version) {
      for (let r = 2; r <= ws.rowCount; r += 1) {
        const row = ws.getRow(r);
        if (/ICD11|ICD-11/i.test(cellText(row.getCell(c.id).value))) {
          const v = cellText(row.getCell(c.version).value);
          if (v) { icdRelease = v.startsWith("ICD") ? v : `ICD-11 ${v}`; break; }
        }
      }
    }
  }

  return { groups, nameIndex, labRules, icdRelease, pendingAliases, confirmatoryProposals };
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i += 1;
      } else out[key] = "true";
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inPath = args.in;
  if (!inPath) throw new Error("--in <workbook.xlsx> is required");
  const outPath = args.out ?? "docs/diagnosis-gate/source/pack.json";
  const reportPath = args.report ?? "docs/diagnosis-gate/reports/validation.md";
  const proposalsPath = args.proposals;

  const bytes = readFileSync(inPath);
  const sourceFileChecksum = createHash("sha256").update(bytes).digest("hex");

  const wb = loadWorkbook(inPath);

  const conversionIssues: ValidationIssue[] = [];
  const cErr = (code: string, message: string, where?: string) => conversionIssues.push({ rule: "C", code, severity: "ERROR", message, where });
  const cWarn = (code: string, message: string, where?: string) => conversionIssues.push({ rule: "C", code, severity: "WARNING", message, where });

  // ── Optional clinical-team-confirmed name variants ────────────────────────
  // Maps a spelling used on one sheet to the canonical name on `Commonest`. This file
  // is CLINICAL CONTENT: engineering proposes candidates in the report, the clinical
  // team confirms them here. Absent → no variant resolution happens at all.
  let nameAliases = new Map<string, string>();
  if (args.aliases) {
    const raw = JSON.parse(readFileSync(args.aliases, "utf8")) as { aliases?: Record<string, string> };
    nameAliases = new Map(Object.entries(raw.aliases ?? {}).map(([k, v]) => [looseNameKey(k), v]));
    console.log(`  name aliases loaded: ${nameAliases.size} (from ${args.aliases})`);
  }

  // ── 0. v0.1 annex, when present (C7.4 / DG-D16) ───────────────────────────
  const annex = readAnnex(wb, cErr);
  if (annex) {
    console.log(`  annex detected: ${annex.groups.length} conditions, ${annex.nameIndex.size} name keys, ${annex.labRules.size} lab rows`);
    if (args.aliases) {
      cWarn("ANNEX_OVERRIDES_ALIAS_FILE", `The workbook carries its own "${ANNEX.aliases}" sheet, which is authoritative — the --aliases file was ignored so that names have one source of truth.`);
      nameAliases = new Map();
    }
  }

  // ── 1. ICD-11 master (reference set for existence checks) ─────────────────
  const icd11 = new Set<string>();
  {
    const ws = getSheet(wb, SHEET.icd11Master);
    const idx = headerIndex(ws, 1);
    const codeCol = col(idx, "code") ?? 1;
    for (let r = 2; r <= ws.rowCount; r += 1) {
      const code = normaliseCode(cellText(ws.getRow(r).getCell(codeCol).value));
      if (code) icd11.add(code);
    }
  }

  // ── 2. Groups, from `Commonest` ───────────────────────────────────────────
  // This sheet has no header in v0 (row 1 is data). Detect a header defensively so a
  // fixed workbook that ADDS a proper code column is picked up automatically.
  const groups: PackGroup[] = [];
  const groupByLooseName = new Map<string, string>(); // looseName → groupCode
  if (annex) {
    // The annex supplies AUTHORED, stable codes — the F1 ask. No provisional numbering,
    // so GROUP_CODES_NOT_AUTHORED no longer fires.
    for (const g of annex.groups) {
      groups.push({ groupCode: g.groupCode, name: g.canonicalName, isCatchAll: g.isCatchAll, sourceRow: g.sourceRow });
      groupByLooseName.set(looseNameKey(g.canonicalName), g.groupCode);
      if (g.originalName) groupByLooseName.set(looseNameKey(g.originalName), g.groupCode);
    }
    for (const [k, v] of annex.nameIndex) if (!groupByLooseName.has(k)) groupByLooseName.set(k, v);
  } else {
    const ws = getSheet(wb, SHEET.commonest);
    const firstCell = cellText(ws.getRow(1).getCell(1).value).toLowerCase();
    const HEADER_WORDS = ["diagnosis", "condition", "name", "group code", "groupcode", "cig"];
    const hasHeader = HEADER_WORDS.includes(firstCell);
    const idx = hasHeader ? headerIndex(ws, 1) : new Map<string, number>();
    const codeCol = hasHeader ? col(idx, "group code", "groupcode", "cig", "code") : undefined;
    const nameCol = (hasHeader ? col(idx, "diagnosis", "condition", "name") : undefined) ?? 1;
    const catchAllCol = hasHeader ? col(idx, "catch all", "catchall", "is catch all", "iscatchall") : undefined;
    const startRow = hasHeader ? 2 : 1;

    if (!codeCol) {
      cErr(
        "GROUP_CODES_NOT_AUTHORED",
        "The workbook has no permanent group-code column, so the codes in this pack were assigned by row order (CIG-001, CIG-002, …). Those codes would change the moment a row is inserted or re-sorted, which would silently re-point every rule and every historical flag. Add a stable code column (fix F1) before this pack is imported.",
        `${SHEET.commonest}`,
      );
    }

    let seq = 0;
    for (let r = startRow; r <= ws.rowCount; r += 1) {
      const name = cellText(ws.getRow(r).getCell(nameCol).value);
      if (!name) continue;
      seq += 1;
      const authored = codeCol ? cellText(ws.getRow(r).getCell(codeCol).value) : "";
      const groupCode = authored || `CIG-${String(seq).padStart(3, "0")}`;
      const key = looseNameKey(name);
      if (groupByLooseName.has(key)) {
        cErr("DUPLICATE_CONDITION", `Condition "${name}" appears more than once on ${SHEET.commonest}.`, `${SHEET.commonest}!A${r}`);
        continue;
      }
      groupByLooseName.set(key, groupCode);
      groups.push({
        groupCode,
        name,
        isCatchAll: catchAllCol ? /^(y|yes|true|1)$/i.test(cellText(ws.getRow(r).getCell(catchAllCol).value)) : false,
        sourceRow: `${SHEET.commonest}!A${r}`,
      });
    }
    if (!catchAllCol) {
      cWarn(
        "CATCH_ALL_NOT_AUTHORED",
        "The workbook has no catch-all column, so no condition is flagged as a category (DG-D8). Candidates are listed in the proposals report for clinical confirmation. Until flagged, these remain ineligible for live routing only because live routing is off by default — not because the gate knows they are categories.",
        SHEET.commonest,
      );
    }
  }

  /** Sheet that defines the condition list — the annex takes over that role when present. */
  const nameAuthority = annex ? ANNEX.conditions : SHEET.commonest;

  /** Resolve a name written on any sheet to a group code, or record why it failed. */
  const resolveGroup = (rawName: string, where: string, issueCode: string): string | null => {
    const name = rawName.trim();
    if (!name) return null;
    const key = looseNameKey(name);
    const direct = groupByLooseName.get(key);
    if (direct) return direct;
    const viaAlias = nameAliases.get(key);
    if (viaAlias) {
      const resolved = groupByLooseName.get(looseNameKey(viaAlias));
      if (resolved) return resolved;
      cErr(issueCode, `Name alias "${name}" → "${viaAlias}" does not match any condition on ${nameAuthority}.`, where);
      return null;
    }
    cErr(
      issueCode,
      `"${name}" does not match any condition on ${nameAuthority}. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction.`,
      where,
    );
    return null;
  };

  // ── 3. Memberships, from `Diagnoses Mapped to ICD` ────────────────────────
  const memberships: PackMembership[] = [];
  {
    const ws = getSheet(wb, SHEET.mapping);
    const idx = headerIndex(ws, 1);
    const nameCol = col(idx, "common diagnosis", "diagnosis") ?? 1;
    const codeCol = col(idx, "matched icd11 code", "icd11 code", "code") ?? 2;
    for (let r = 2; r <= ws.rowCount; r += 1) {
      const row = ws.getRow(r);
      const name = cellText(row.getCell(nameCol).value);
      if (!name) continue;
      const where = `${SHEET.mapping}!A${r}`;
      const groupCode = resolveGroup(name, where, "UNRESOLVED_MAPPING_NAME");
      if (!groupCode) continue;
      const code = normaliseCode(cellText(row.getCell(codeCol).value));
      if (!code) {
        cErr("MAPPING_CODE_EMPTY", `"${name}" has a mapping row with no ICD code.`, where);
        continue;
      }
      memberships.push({ groupCode, codeSystem: "ICD11", code, provenance: "AUTHORED" });
    }
    // A condition on `Commonest` with no mapping row at all cannot ever be resolved.
    const mapped = new Set(memberships.map((m) => m.groupCode));
    for (const g of groups) {
      if (!mapped.has(g.groupCode)) {
        cErr("CONDITION_UNMAPPED", `Condition "${g.name}" has no rows on ${SHEET.mapping} — no diagnosis code will ever resolve to it.`, g.sourceRow);
      }
    }
  }

  // ── 4. Lab rules + aliases, from `Commonest Labs Rationale` ───────────────
  const labRules: PackLabRule[] = [];
  const links: PackLink[] = [];
  const aliases: PackAlias[] = [];
  {
    const ws = getSheet(wb, SHEET.labs);
    const idx = headerIndex(ws, 1);
    const c = {
      id: col(idx, "test_id", "test id") ?? 1,
      name: col(idx, "test_name", "test name") ?? 2,
      dept: col(idx, "department"),
      requires: col(idx, "requires_diagnosis", "requires diagnosis"),
      supported: col(idx, "supported_icd11_diagnoses", "supported diagnoses"),
      window: col(idx, "repeat_window_hours", "repeat window hours"),
      audit: col(idx, "audit_rule", "audit rule"),
      failure: col(idx, "failure_message", "failure message"),
    };

    for (let r = 2; r <= ws.rowCount; r += 1) {
      const row = ws.getRow(r);
      const testCode = cellText(row.getCell(c.id).value);
      if (!testCode) continue;
      const where = `${SHEET.labs}!A${r}`;
      const testName = cellText(row.getCell(c.name).value);

      const requiresRaw = c.requires ? cellText(row.getCell(c.requires).value) : "";
      if (c.requires && !/^(yes|no|true|false|y|n)$/i.test(requiresRaw)) {
        cErr("REQUIRES_DIAGNOSIS_UNPARSEABLE", `Test "${testCode}" has Requires_Diagnosis = "${requiresRaw}", which is neither Yes nor No.`, where);
      }
      const requiresDiagnosis = /^(yes|true|y)$/i.test(requiresRaw);

      let repeatWindowHours: number | null = null;
      if (c.window) {
        const raw = cellText(row.getCell(c.window).value);
        if (raw) {
          const n = Number(raw);
          if (!Number.isFinite(n)) cErr("REPEAT_WINDOW_UNPARSEABLE", `Test "${testCode}" has Repeat_Window_Hours = "${raw}", which is not a number.`, where);
          else repeatWindowHours = n;
        }
      }

      // DG-D17: v0's Failure_Message is sometimes clinician shorthand ("No fever/history
      // of fever") that should never be shown to a provider. When the annex supplies a
      // provider-facing rewrite, prefer it.
      const annexRule = annex?.labRules.get(testCode);
      const v0Message = c.failure ? cellText(row.getCell(c.failure).value) : "";
      const failureMessage = annexRule?.providerMessage || v0Message;
      if (!failureMessage) cErr("FAILURE_MESSAGE_EMPTY", `Test "${testCode}" has no provider-facing message — a flag on this test could not be explained to the provider.`, where);

      labRules.push({
        testCode,
        testName,
        department: c.dept ? cellText(row.getCell(c.dept).value) || undefined : undefined,
        requiresDiagnosis,
        repeatWindowHours,
        failureMessage,
        auditRule: c.audit ? cellText(row.getCell(c.audit).value) || undefined : undefined,
        sourceRow: where,
      });

      // The test's own name is the one alias we can derive mechanically: it is how the
      // test is written on a bill. CPT/service codes are not in the workbook — see the
      // RULE_HAS_NO_ALIAS warnings and the C1.5 coverage report.
      if (testName) aliases.push({ testCode, matchType: "NORMALIZED_NAME", value: normaliseAliasValue(testName) });

      if (annexRule) {
        // The annex already resolved these to group codes, so there is no free text left
        // to guess at. A code that does not exist is an error, never a silent drop.
        for (const groupCode of annexRule.supportedGroupCodes) {
          if (groups.some((g) => g.groupCode === groupCode)) links.push({ testCode, groupCode, linkType: "SUPPORTED" });
          else cErr("ANNEX_UNKNOWN_SUPPORTED_GROUP", `Test "${testCode}" lists supported group "${groupCode}", which is not defined on ${ANNEX.conditions}.`, where);
        }
        // Confirmatory links import ONLY when signed off (DG-D16). v0.1 has none, so R4
        // stays inert — correctly, and visibly, rather than by accident.
        if (annexRule.confirmatoryApproved && annexRule.confirmatoryGroup) {
          if (groups.some((g) => g.groupCode === annexRule.confirmatoryGroup)) {
            links.push({ testCode, groupCode: annexRule.confirmatoryGroup, linkType: "CONFIRMATORY" });
          } else {
            cErr("ANNEX_UNKNOWN_CONFIRMATORY_GROUP", `Test "${testCode}" names confirmatory group "${annexRule.confirmatoryGroup}", which is not defined on ${ANNEX.conditions}.`, where);
          }
        }
      } else if (c.supported) {
        // Legacy path: free-text supported-diagnoses column.
        const raw = cellText(row.getCell(c.supported).value);
        for (const token of raw.split(/[;,]/).map((t) => t.trim()).filter(Boolean)) {
          const groupCode = resolveGroup(token, `${where} (Supported_ICD11_Diagnoses)`, "UNRESOLVED_SUPPORTED_DIAGNOSIS");
          if (groupCode) links.push({ testCode, groupCode, linkType: "SUPPORTED" });
        }
      }
    }
  }

  // ── 5. Confirmatory links: PROPOSED ONLY, never derived into the pack ─────
  // The workbook states confirmation in prose ("Positive Malaria RDT or blood smear").
  // Turning prose into a machine rule is a clinical decision, so we surface candidates
  // by a transparent token-overlap measure and leave the pack's links empty.
  const confirmatoryProposals: Array<{ groupCode: string; groupName: string; rule: string; testCode: string; testName: string }> = [];
  {
    const ws = getSheet(wb, SHEET.features);
    const idx = headerIndex(ws, 1);
    const nameCol = col(idx, "diagnosis");
    const confCol = col(idx, "diagnostic confirmation rule");
    if (!nameCol || !confCol) {
      cWarn("FEATURES_COLUMNS_MISSING", `Could not locate Diagnosis / Diagnostic Confirmation Rule columns on "${SHEET.features}" — no confirmatory candidates proposed.`);
    } else {
      for (let r = 2; r <= ws.rowCount; r += 1) {
        const row = ws.getRow(r);
        const name = cellText(row.getCell(nameCol).value);
        const rule = cellText(row.getCell(confCol).value);
        if (!name || !rule) continue;
        const key = looseNameKey(name);
        const groupCode = groupByLooseName.get(key) ?? (nameAliases.has(key) ? groupByLooseName.get(looseNameKey(nameAliases.get(key)!)) : undefined);
        if (!groupCode) continue; // already reported via the features-name check below
        const ruleLoose = looseNameKey(rule);
        for (const lr of labRules) {
          if (!lr.testName) continue;
          // Candidate when the test's distinctive words all appear in the prose rule.
          const words = lr.testName.split(/[^A-Za-z0-9]+/).filter((w) => w.length > 3);
          if (words.length > 0 && words.every((w) => ruleLoose.includes(w.toLowerCase()))) {
            confirmatoryProposals.push({ groupCode, groupName: name, rule, testCode: lr.testCode, testName: lr.testName });
          }
        }
      }
    }
  }

  // Cross-check the features sheet's names so the F1 divergence is quantified here too.
  {
    const ws = getSheet(wb, SHEET.features);
    const idx = headerIndex(ws, 1);
    const nameCol = col(idx, "diagnosis");
    if (nameCol) {
      for (let r = 2; r <= ws.rowCount; r += 1) {
        const name = cellText(ws.getRow(r).getCell(nameCol).value);
        if (!name) continue;
        const key = looseNameKey(name);
        if (!groupByLooseName.has(key) && !nameAliases.has(key)) {
          cErr(
            "UNRESOLVED_FEATURES_NAME",
            `"${name}" on ${SHEET.features.trim()} does not match any condition on ${nameAuthority}. Its clinical detail cannot be attached to a group.`,
            `${SHEET.features.trim()}!C${r}`,
          );
        }
      }
    }
  }

  // ── 6. Assemble, validate, write ──────────────────────────────────────────
  const pack: ProtocolPack = {
    meta: {
      formatVersion: PACK_FORMAT_VERSION,
      sourceFileName: basename(inPath),
      sourceFileChecksum,
      notes: args.notes,
      ...(annex?.icdRelease ? { icdRelease: annex.icdRelease } : {}),
    },
    groups,
    memberships,
    labRules,
    links,
    aliases,
  };

  const result = validatePack(pack, { knownCodes: { ICD11: icd11 }, conversionIssues });

  const serialised = serialisePack(pack);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, serialised);

  const packChecksum = createHash("sha256").update(serialised).digest("hex");

  // Framing for the clinical team. It is generated rather than hand-written onto the
  // report, so it cannot drift from the numbers underneath it or vanish on the next run.
  const preamble: string[] = [];
  if (annex) {
    const refusedConfirmatory = annex.confirmatoryProposals.length;
    const refusedAliases = annex.pendingAliases.length;
    const crossGroup = result.stats.crossGroupCodes ?? 0;
    preamble.push("## Reading this report");
    preamble.push("");
    preamble.push(
      "**Nothing in this workbook is in force.** No rule from it affects a single claim " +
        "today, and none will until your team signs the specification and approves a pack " +
        "through the normal maker/checker route.",
    );
    preamble.push("");
    preamble.push(
      "**What this version settled.** Conditions now carry stable codes (`CIG-001`–" +
        "`CIG-040`), so the sheets no longer join on a spelt-out condition name — that was " +
        "the single largest source of errors last time, and it is gone. Supported tests are " +
        "stated as codes rather than free text, the provider-facing messages have been " +
        "rewritten, and three broad categories are correctly flagged as categories.",
    );
    preamble.push("");
    preamble.push(
      `**What we did NOT accept.** Where the workbook marks its own rows as pending or ` +
        `needing review, we report them and stop — a status column is not a signature. So ` +
        `${refusedConfirmatory} proposed confirmatory test(s) and ${refusedAliases} proposed ` +
        `condition merge(s) were left out, and are listed in the companion proposals file. ` +
        `A consequence worth stating plainly: **rule R4 (confirmatory test present) still ` +
        `applies to nothing at all**, because no condition yet has a confirmed test against ` +
        `a clinician's name.`,
    );
    preamble.push("");
    preamble.push(
      `**What still blocks the import.** ${crossGroup} ICD codes belong to more than one ` +
        `condition — \`CA09\`, for instance, sits in Allergic Rhinitis, Nasopharyngitis and ` +
        `Pharyngitis at once. This is clinically reasonable (the ICD hierarchy overlaps), but ` +
        `it leaves the system no principled way to choose which condition's rules apply, and ` +
        `we will not let it guess. Every such claim is therefore covered by no rule. Assigning ` +
        `each code to exactly one condition is the single highest-value change your team can ` +
        `make, and it is a clinical decision rather than a data-cleaning one — which is why ` +
        `this version, which did not change any code assignment, did not move that number.`,
    );
    preamble.push("");
    preamble.push(
      "The rest of this report is the full list, grouped so a repeated defect reads as one " +
        "line. Every entry names the sheet and row to edit.",
    );
  }

  const report = renderValidationMarkdown(result, {
    sourceFileName: basename(inPath),
    generatedAt: args.now ?? new Date().toISOString().slice(0, 10),
    packVersionNote: `pack sha256 \`${packChecksum.slice(0, 16)}…\` · source sha256 \`${sourceFileChecksum.slice(0, 16)}…\``,
    preamble,
  });
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report);

  if (proposalsPath) {
    const P: string[] = [];
    P.push("# Proposals for clinical confirmation");
    P.push("");
    P.push(
      "These are **candidates only**. Nothing here is in the pack, and nothing here will " +
        "ever enter the pack until the clinical team confirms it in the workbook. The " +
        "converter proposes; it does not decide.",
    );
    P.push("");
    P.push("## Confirmatory test candidates (rule R4)");
    P.push("");
    P.push(
      "The workbook states confirmation in prose. Below, a test was proposed when every " +
        "distinctive word of its name appears in the condition's confirmation rule. Until a " +
        "machine-readable confirmatory column exists, **R4 cannot fire for any condition.**",
    );
    P.push("");
    if (confirmatoryProposals.length === 0) {
      P.push("_No candidates found._");
    } else {
      P.push("| Condition | Group | Proposed test | Confirmation rule (verbatim) |");
      P.push("|---|---|---|---|");
      for (const p of confirmatoryProposals) {
        P.push(`| ${p.groupName} | \`${p.groupCode}\` | ${p.testCode} — ${p.testName} | ${p.rule.replace(/\|/g, "\\|")} |`);
      }
    }
    P.push("");
    P.push("## Catch-all candidates (DG-D8)");
    P.push("");
    P.push(
      `Conditions mapping to more than ${CATCH_ALL_PROPOSAL_THRESHOLD} ICD codes. Breadth is a signal, ` +
        "not a diagnosis of the problem — the clinical team decides whether each is a category " +
        "that must never unlock the automated path.",
    );
    P.push("");
    const counts = new Map<string, number>();
    for (const m of memberships) counts.set(m.groupCode, (counts.get(m.groupCode) ?? 0) + 1);
    const wide = groups
      .map((g) => ({ g, n: counts.get(g.groupCode) ?? 0 }))
      .filter((x) => x.n > CATCH_ALL_PROPOSAL_THRESHOLD)
      .sort((a, b) => b.n - a.n);
    if (wide.length === 0) {
      P.push("_No candidates._");
    } else {
      P.push("| Condition | Group | ICD codes mapped |");
      P.push("|---|---|---:|");
      for (const x of wide) P.push(`| ${x.g.name} | \`${x.g.groupCode}\` | ${x.n} |`);
    }
    P.push("");

    if (annex) {
      // Everything the annex PROPOSED but did not sign off. These are held out of the
      // pack deliberately, and listing them is how the clinical team sees what is waiting
      // on a decision rather than on more work.
      P.push("## Held out of the pack, awaiting clinical sign-off (v0.1 annex)");
      P.push("");
      P.push("### Confirmatory tests (rule R4)");
      P.push("");
      if (annex.confirmatoryProposals.length === 0) {
        P.push("_None proposed._");
      } else {
        P.push(
          "Each row proposes a test that would confirm a condition. None is imported, so " +
            "**R4 fires for nothing** — the rule is present and inert. Signing these off is " +
            "what switches it on.",
        );
        P.push("");
        P.push("| Test | Proposed confirmatory condition | Status in workbook |");
        P.push("|---|---|---|");
        for (const c of annex.confirmatoryProposals) P.push(`| ${c.testCode} | \`${c.groupCode}\` | ${c.status} |`);
      }
      P.push("");
      P.push("### Name aliases needing a scope decision");
      P.push("");
      if (annex.pendingAliases.length === 0) {
        P.push("_None._");
      } else {
        P.push(
          "The annex marks these as needing review rather than as safe spelling fixes, so " +
            "the converter did not accept them. Deciding that two labels mean one condition " +
            "is a clinical judgement, not a text-matching one.",
        );
        P.push("");
        P.push("| Name in the workbook | Proposed condition | Status |");
        P.push("|---|---|---|");
        for (const a of annex.pendingAliases) P.push(`| ${a.alias} | \`${a.groupCode}\` | ${a.status} |`);
      }
      P.push("");
    }

    mkdirSync(dirname(proposalsPath), { recursive: true });
    writeFileSync(proposalsPath, P.join("\n"));
  }

  // ── Console summary ───────────────────────────────────────────────────────
  console.log(`\nDiagnosis Gate — workbook conversion`);
  console.log(`  source      : ${inPath}`);
  console.log(`  pack        : ${outPath}`);
  console.log(`  report      : ${reportPath}`);
  if (proposalsPath) console.log(`  proposals   : ${proposalsPath}`);
  console.log(`  groups=${result.stats.groups} memberships=${result.stats.memberships} labRules=${result.stats.labRules} links=${result.stats.links} aliases=${result.stats.aliases}`);
  console.log(`  errors=${result.errors.length} warnings=${result.warnings.length}`);
  console.log(`  verdict     : ${result.importable ? "IMPORTABLE" : "NOT IMPORTABLE (expected for an unfixed workbook)"}`);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
