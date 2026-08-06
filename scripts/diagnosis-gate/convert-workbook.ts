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
import ExcelJS from "exceljs";
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

type Cell = ExcelJS.CellValue;

/** exceljs cells can be rich text, hyperlinks or formula results — flatten to text. */
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
    if ("hyperlink" in o && typeof o.hyperlink === "string") return o.hyperlink.trim();
  }
  return String(v).trim();
}

function getSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const exact = wb.getWorksheet(name);
  if (exact) return exact;
  const loose = wb.worksheets.find((w) => w.name.trim() === name.trim());
  if (loose) return loose;
  throw new Error(`Worksheet "${name}" not found. Available: ${wb.worksheets.map((w) => `"${w.name}"`).join(", ")}`);
}

/** Map header text → column index for a sheet whose row `headerRow` holds headers. */
function headerIndex(ws: ExcelJS.Worksheet, headerRow: number): Map<string, number> {
  const idx = new Map<string, number>();
  const row = ws.getRow(headerRow);
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    const t = cellText(cell.value);
    if (t) idx.set(t.trim().toLowerCase(), col);
  });
  return idx;
}

function col(idx: Map<string, number>, ...candidates: string[]): number | undefined {
  for (const c of candidates) {
    const hit = idx.get(c.toLowerCase());
    if (hit) return hit;
  }
  return undefined;
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

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(inPath);

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
  {
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
      cErr(issueCode, `Name alias "${name}" → "${viaAlias}" does not match any condition on ${SHEET.commonest}.`, where);
      return null;
    }
    cErr(
      issueCode,
      `"${name}" does not match any condition on ${SHEET.commonest}. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction.`,
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

      const failureMessage = c.failure ? cellText(row.getCell(c.failure).value) : "";
      if (!failureMessage) cErr("FAILURE_MESSAGE_EMPTY", `Test "${testCode}" has no Failure_Message — a flag on this test could not be explained to the provider.`, where);

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

      // SUPPORTED links from the free-text supported-diagnoses column.
      if (c.supported) {
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
            `"${name}" on ${SHEET.features.trim()} does not match any condition on ${SHEET.commonest}. Its clinical detail cannot be attached to a group.`,
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
  const report = renderValidationMarkdown(result, {
    sourceFileName: basename(inPath),
    generatedAt: args.now ?? new Date().toISOString().slice(0, 10),
    packVersionNote: `pack sha256 \`${packChecksum.slice(0, 16)}…\` · source sha256 \`${sourceFileChecksum.slice(0, 16)}…\``,
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
