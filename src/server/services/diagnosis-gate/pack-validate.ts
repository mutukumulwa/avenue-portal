/**
 * Diagnosis Gate — protocol-pack validation (C1.3).
 *
 * The gatekeeper between clinical content and the engine. Shared by the offline
 * converter CLI and (from C3.2) the admin import screen, so a pack is judged by exactly
 * the same rules whichever door it arrives through.
 *
 * DESIGN INTENT (DG-D7): this module is the reason engineering never has to guess. Any
 * gap in the source workbook — an unmapped condition, a free-text link that resolves to
 * nothing, a test with no way to recognise it on a claim — surfaces here as a named,
 * located issue that goes back to the clinical team. Nothing is defaulted, inferred, or
 * quietly dropped.
 *
 * ERRORS block import (the pack cannot become a DRAFT). WARNINGS are recorded on the
 * pack and shown to the reviewer, but do not block — they mark content that is legal
 * but inert or incomplete (e.g. a rule with no alias can never fire).
 */
import type { ProtocolPack, CodeSystem } from "./pack-types";
import { PACK_FORMAT_VERSION, normaliseCode, isSubDayWindow, MIN_ENFORCEABLE_WINDOW_HOURS } from "./pack-types";

export type IssueSeverity = "ERROR" | "WARNING";

export interface ValidationIssue {
  /** Rule id, e.g. "V3" — stable so the report and the fix-list can cross-reference. */
  rule: string;
  /** Machine-readable issue type, e.g. "UNKNOWN_CODE". */
  code: string;
  severity: IssueSeverity;
  message: string;
  /** Where in the source this came from, when known (e.g. "Commonest!A7"). */
  where?: string;
}

export interface ValidationContext {
  /**
   * Codes known to be real, per system. ICD11 comes from the workbook's own master
   * sheet; ICD10 from the platform's `ICD10Code` table. A system absent from this map
   * is not checked for existence (V3 downgrades to a warning explaining why).
   */
  knownCodes?: Partial<Record<CodeSystem, Set<string>>>;
  /** Issues carried over from the conversion step (unresolved names, etc.). */
  conversionIssues?: ValidationIssue[];
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: Record<string, number>;
  /** True when the pack may become a DRAFT (no errors). */
  importable: boolean;
}

const err = (rule: string, code: string, message: string, where?: string): ValidationIssue => ({ rule, code, severity: "ERROR", message, where });
const warn = (rule: string, code: string, message: string, where?: string): ValidationIssue => ({ rule, code, severity: "WARNING", message, where });

/** ICD codes are alphanumeric with at most one dotted extension; never blank/spaced. */
function codeWellFormed(code: string): boolean {
  return /^[A-Z0-9]{2,8}(\.[A-Z0-9]{1,5})?$/.test(code);
}

export function validatePack(pack: ProtocolPack, ctx: ValidationContext = {}): ValidationResult {
  const issues: ValidationIssue[] = [...(ctx.conversionIssues ?? [])];

  // ── Format ────────────────────────────────────────────────────────────────
  if (pack.meta?.formatVersion !== PACK_FORMAT_VERSION) {
    issues.push(err("V0", "FORMAT_VERSION", `Pack format version ${String(pack.meta?.formatVersion)} is not the supported version ${PACK_FORMAT_VERSION}.`));
  }

  const groupByCode = new Map(pack.groups.map((g) => [g.groupCode, g]));
  const ruleByCode = new Map(pack.labRules.map((r) => [r.testCode, r]));

  // ── V1: group identity ────────────────────────────────────────────────────
  const seenGroup = new Set<string>();
  for (const g of pack.groups) {
    if (!g.groupCode?.trim()) {
      issues.push(err("V1", "GROUP_CODE_MISSING", `A group has no groupCode (name: "${g.name ?? "?"}").`, g.sourceRow));
      continue;
    }
    if (seenGroup.has(g.groupCode)) {
      issues.push(err("V1", "GROUP_CODE_DUPLICATE", `Duplicate group code "${g.groupCode}".`, g.sourceRow));
    }
    seenGroup.add(g.groupCode);
    if (!g.name?.trim()) issues.push(warn("V1", "GROUP_NAME_MISSING", `Group "${g.groupCode}" has no display name.`, g.sourceRow));
  }
  if (pack.groups.length === 0) issues.push(err("V1", "NO_GROUPS", "The pack defines no intervention groups."));

  // ── V2 / V3: memberships ──────────────────────────────────────────────────
  const seenMembership = new Set<string>();
  const membershipsPerGroup = new Map<string, number>();
  const uncheckedSystems = new Set<CodeSystem>();
  for (const m of pack.memberships) {
    const where = `${m.groupCode}/${m.codeSystem}/${m.code}`;
    if (!groupByCode.has(m.groupCode)) {
      issues.push(err("V1", "MEMBERSHIP_UNKNOWN_GROUP", `Membership references unknown group "${m.groupCode}".`, where));
      continue;
    }
    if (!m.code?.trim()) {
      issues.push(err("V2", "CODE_EMPTY", `Group "${m.groupCode}" has a membership row with an empty code — the condition is listed but not mapped.`, where));
      continue;
    }
    const code = normaliseCode(m.code);
    if (!codeWellFormed(code)) {
      issues.push(err("V2", "CODE_MALFORMED", `Code "${m.code}" (group ${m.groupCode}) is not a well-formed ${m.codeSystem} code.`, where));
      continue;
    }
    const key = `${m.groupCode}|${m.codeSystem}|${code}`;
    if (seenMembership.has(key)) {
      issues.push(warn("V5", "MEMBERSHIP_DUPLICATE", `Duplicate membership ${code} in group ${m.groupCode} — ignored on import.`, where));
    }
    seenMembership.add(key);
    membershipsPerGroup.set(m.groupCode, (membershipsPerGroup.get(m.groupCode) ?? 0) + 1);

    const known = ctx.knownCodes?.[m.codeSystem];
    if (known) {
      if (!known.has(code)) {
        issues.push(err("V3", "UNKNOWN_CODE", `Code "${code}" (group ${m.groupCode}) does not exist in the ${m.codeSystem} reference set.`, where));
      }
    } else {
      uncheckedSystems.add(m.codeSystem);
    }
  }
  for (const sys of uncheckedSystems) {
    issues.push(warn("V3", "CODE_SET_UNAVAILABLE", `${sys} memberships were not existence-checked: no ${sys} reference set was supplied to the validator.`));
  }

  // ── V9: a group with no codes can never be resolved from a claim ──────────
  for (const g of pack.groups) {
    if (!membershipsPerGroup.get(g.groupCode)) {
      issues.push(err("V9", "GROUP_HAS_NO_CODES", `Group "${g.groupCode}" (${g.name}) has no diagnosis codes — no claim can ever resolve to it.`, g.sourceRow));
    }
  }

  // ── V11 (DG-D15): one code must belong to exactly one condition ───────────
  // A code in several conditions is clinically defensible (ICD hierarchies overlap) but
  // leaves the engine no principled way to choose which condition's rules apply — and
  // the stage refuses to guess, so every such claim goes unevaluated. Blocking at import
  // puts the decision where it belongs: with the clinical team, once, in the content.
  // Reported per CODE rather than per membership, so 85 conflicts read as 85 decisions.
  const groupsPerCode = new Map<string, Set<string>>();
  for (const m of pack.memberships) {
    if (!m.code?.trim() || !groupByCode.has(m.groupCode)) continue;
    const key = `${m.codeSystem}|${normaliseCode(m.code)}`;
    const set = groupsPerCode.get(key) ?? new Set<string>();
    set.add(m.groupCode);
    groupsPerCode.set(key, set);
  }
  let crossGroupCodes = 0;
  for (const [key, groups] of groupsPerCode) {
    if (groups.size < 2) continue;
    crossGroupCodes += 1;
    const [system, code] = key.split("|");
    const names = [...groups].sort().map((gc) => `${gc} (${groupByCode.get(gc)?.name ?? "?"})`).join(", ");
    issues.push(
      err(
        "V11",
        "CODE_IN_MULTIPLE_GROUPS",
        `${system} code "${code}" belongs to ${groups.size} conditions — ${names}. A claim carrying it cannot be resolved to one condition, so no clinical rule would be evaluated. Assign the code to exactly one condition.`,
        key,
      ),
    );
  }

  // ── V4 / V6: lab rules and links ──────────────────────────────────────────
  const seenRule = new Set<string>();
  for (const r of pack.labRules) {
    if (!r.testCode?.trim()) {
      issues.push(err("V4", "TEST_CODE_MISSING", `A lab rule has no testCode (name: "${r.testName ?? "?"}").`, r.sourceRow));
      continue;
    }
    if (seenRule.has(r.testCode)) issues.push(err("V5", "TEST_CODE_DUPLICATE", `Duplicate test code "${r.testCode}".`, r.sourceRow));
    seenRule.add(r.testCode);
    if (!r.failureMessage?.trim()) {
      issues.push(err("V4", "FAILURE_MESSAGE_MISSING", `Test "${r.testCode}" has no provider-facing failure message — a flag would be unexplainable.`, r.sourceRow));
    }
    if (r.repeatWindowHours != null && (!Number.isFinite(r.repeatWindowHours) || r.repeatWindowHours <= 0)) {
      issues.push(err("V4", "REPEAT_WINDOW_INVALID", `Test "${r.testCode}" has a non-positive repeat window (${String(r.repeatWindowHours)}).`, r.sourceRow));
    }
    // V12 (DG-D14): claims carry a service DATE, not a time. A window shorter than a day
    // cannot be evaluated — enforcing it either way would produce false positives on
    // same-day repeats and false negatives across midnight. Legal content, inert rule,
    // so this warns rather than blocks (the V10 philosophy).
    if (isSubDayWindow(r.repeatWindowHours)) {
      issues.push(
        warn(
          "V12",
          "REPEAT_WINDOW_SUBDAY_UNENFORCEABLE",
          `Test "${r.testCode}" (${r.testName}) has a ${r.repeatWindowHours}-hour repeat window, which cannot be checked against date-only claim data — the rule will be recorded as inert rather than evaluated. Use a window of ${MIN_ENFORCEABLE_WINDOW_HOURS} hours or more, or capture a performed-at timestamp.`,
          r.sourceRow,
        ),
      );
    }
  }

  const supportedByRule = new Map<string, number>();
  const confirmatoryByGroup = new Map<string, number>();
  const seenLink = new Set<string>();
  for (const l of pack.links) {
    const where = `${l.testCode}→${l.groupCode}/${l.linkType}`;
    if (!ruleByCode.has(l.testCode)) {
      issues.push(err("V4", "LINK_UNKNOWN_TEST", `Link references unknown test "${l.testCode}".`, where));
      continue;
    }
    if (!groupByCode.has(l.groupCode)) {
      issues.push(err("V4", "LINK_UNKNOWN_GROUP", `Link references unknown group "${l.groupCode}".`, where));
      continue;
    }
    const key = `${l.testCode}|${l.groupCode}|${l.linkType}`;
    if (seenLink.has(key)) issues.push(warn("V5", "LINK_DUPLICATE", `Duplicate link ${where} — ignored on import.`, where));
    seenLink.add(key);
    if (l.linkType === "SUPPORTED") supportedByRule.set(l.testCode, (supportedByRule.get(l.testCode) ?? 0) + 1);
    else confirmatoryByGroup.set(l.groupCode, (confirmatoryByGroup.get(l.groupCode) ?? 0) + 1);
  }

  // V6: a diagnosis-requiring test with no supported condition would flag EVERY claim
  // that bills it — a rule that fires universally is a misconfiguration, not a control.
  for (const r of pack.labRules) {
    if (r.requiresDiagnosis && !supportedByRule.get(r.testCode)) {
      issues.push(err("V6", "REQUIRES_DIAGNOSIS_NO_SUPPORT", `Test "${r.testCode}" (${r.testName}) requires a diagnosis but lists no supported condition — R2 would flag every claim billing it.`, r.sourceRow));
    }
  }

  // ── V10: aliases — without one, a rule can never match a claim line ───────
  const aliasesByRule = new Map<string, number>();
  const seenAlias = new Set<string>();
  for (const a of pack.aliases) {
    const where = `${a.matchType}:${a.value}`;
    if (!ruleByCode.has(a.testCode)) {
      issues.push(err("V4", "ALIAS_UNKNOWN_TEST", `Alias references unknown test "${a.testCode}".`, where));
      continue;
    }
    if (!a.value?.trim()) {
      issues.push(err("V10", "ALIAS_EMPTY", `Test "${a.testCode}" has an empty alias value.`, where));
      continue;
    }
    const key = `${a.matchType}|${a.value}`;
    if (seenAlias.has(key)) {
      issues.push(err("V5", "ALIAS_AMBIGUOUS", `Alias "${a.value}" (${a.matchType}) maps to more than one test — a claim line would be ambiguous.`, where));
    }
    seenAlias.add(key);
    aliasesByRule.set(a.testCode, (aliasesByRule.get(a.testCode) ?? 0) + 1);
  }
  for (const r of pack.labRules) {
    if (!aliasesByRule.get(r.testCode)) {
      issues.push(warn("V10", "RULE_HAS_NO_ALIAS", `Test "${r.testCode}" (${r.testName}) has no alias — no claim line can be recognised as this test, so its rules are inert.`, r.sourceRow));
    }
  }

  // ── V7: catch-alls must not be live-eligible (DG-D8) ──────────────────────
  const catchAlls = pack.groups.filter((g) => g.isCatchAll);
  for (const g of catchAlls) {
    issues.push(warn("V7", "CATCH_ALL_GROUP", `Group "${g.groupCode}" (${g.name}) is flagged as a catch-all and is permanently barred from live routing (DG-D8).`, g.sourceRow));
  }

  // ── V8: R4 reachability ───────────────────────────────────────────────────
  if (confirmatoryByGroup.size === 0 && pack.groups.length > 0) {
    issues.push(warn("V8", "NO_CONFIRMATORY_LINKS", "No condition declares a confirmatory test, so rule R4 (confirmation-present) cannot fire for any claim in this pack."));
  }

  const errors = issues.filter((i) => i.severity === "ERROR");
  const warnings = issues.filter((i) => i.severity === "WARNING");

  return {
    errors,
    warnings,
    importable: errors.length === 0,
    stats: {
      groups: pack.groups.length,
      catchAllGroups: catchAlls.length,
      memberships: pack.memberships.length,
      icd10Memberships: pack.memberships.filter((m) => m.codeSystem === "ICD10").length,
      icd11Memberships: pack.memberships.filter((m) => m.codeSystem === "ICD11").length,
      generatedCrosswalkMemberships: pack.memberships.filter((m) => m.provenance === "GENERATED_CROSSWALK").length,
      labRules: pack.labRules.length,
      rulesRequiringDiagnosis: pack.labRules.filter((r) => r.requiresDiagnosis).length,
      rulesWithRepeatWindow: pack.labRules.filter((r) => r.repeatWindowHours != null).length,
      subdayWindowRules: pack.labRules.filter((r) => isSubDayWindow(r.repeatWindowHours)).length,
      crossGroupCodes,
      links: pack.links.length,
      supportedLinks: pack.links.filter((l) => l.linkType === "SUPPORTED").length,
      confirmatoryLinks: pack.links.filter((l) => l.linkType === "CONFIRMATORY").length,
      aliases: pack.aliases.length,
      errors: errors.length,
      warnings: warnings.length,
    },
  };
}

/** Group issues by their machine code so a 100-row defect reads as one line. */
function summarise(issues: ValidationIssue[]): Array<{ rule: string; code: string; count: number; sample: ValidationIssue }> {
  const buckets = new Map<string, { rule: string; code: string; count: number; sample: ValidationIssue }>();
  for (const i of issues) {
    const key = `${i.rule}|${i.code}`;
    const b = buckets.get(key);
    if (b) b.count += 1;
    else buckets.set(key, { rule: i.rule, code: i.code, count: 1, sample: i });
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/** Human-readable report — this is the artifact that goes back to the clinical team. */
export function renderValidationMarkdown(
  result: ValidationResult,
  meta: {
    sourceFileName: string;
    generatedAt: string;
    packVersionNote?: string;
    /**
     * Extra markdown placed directly under the header, for framing a specific workbook
     * version. It lives here rather than being hand-added to the generated file, so it
     * survives the next regeneration — an edited report would silently lose it.
     */
    preamble?: string[];
  },
): string {
  const L: string[] = [];
  L.push(`# Protocol pack validation report`);
  L.push("");
  L.push(`| | |`);
  L.push(`|---|---|`);
  L.push(`| Source | \`${meta.sourceFileName}\` |`);
  L.push(`| Generated | ${meta.generatedAt} |`);
  L.push(`| Verdict | ${result.importable ? "**IMPORTABLE** — no blocking errors" : `**NOT IMPORTABLE** — ${result.errors.length} blocking error(s)`} |`);
  if (meta.packVersionNote) L.push(`| Note | ${meta.packVersionNote} |`);
  L.push("");

  if (meta.preamble?.length) {
    L.push(...meta.preamble);
    L.push("");
  }

  L.push(`## What this report is`);
  L.push("");
  L.push(
    "The Diagnosis Gate never guesses. Where the workbook is missing a value, spells a " +
      "condition two different ways, or points at something that does not exist, the " +
      "import stops and lists it here rather than inventing a rule. Everything below is " +
      "a concrete edit to the workbook; once the errors are cleared the pack imports.",
  );
  L.push("");

  L.push(`## Content counted`);
  L.push("");
  L.push(`| Item | Count |`);
  L.push(`|---|---:|`);
  for (const [k, v] of Object.entries(result.stats)) {
    if (k === "errors" || k === "warnings") continue;
    L.push(`| ${k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} | ${v} |`);
  }
  L.push("");

  const renderBlock = (title: string, blurb: string, issues: ValidationIssue[]) => {
    L.push(`## ${title} (${issues.length})`);
    L.push("");
    if (issues.length === 0) {
      L.push("_None._");
      L.push("");
      return;
    }
    L.push(blurb);
    L.push("");
    L.push(`| Rule | Issue | Count | Example |`);
    L.push(`|---|---|---:|---|`);
    for (const s of summarise(issues)) {
      const example = `${s.sample.message}${s.sample.where ? ` _(${s.sample.where})_` : ""}`.replace(/\|/g, "\\|");
      L.push(`| ${s.rule} | \`${s.code}\` | ${s.count} | ${example} |`);
    }
    L.push("");
  };

  renderBlock("Blocking errors", "These must be fixed in the workbook before the pack can be imported.", result.errors);
  renderBlock(
    "Warnings",
    "These do not block import, but they mark content that is legal yet **inert** — a rule that cannot match a claim, or a group barred from live routing. Worth resolving before the shadow campaign, since inert rules make coverage look better than it is.",
    result.warnings,
  );

  if (!result.importable) {
    L.push(`## Full error list`);
    L.push("");
    L.push("| # | Rule | Issue | Detail | Where |");
    L.push("|---:|---|---|---|---|");
    result.errors.forEach((e, i) => {
      L.push(`| ${i + 1} | ${e.rule} | \`${e.code}\` | ${e.message.replace(/\|/g, "\\|")} | ${e.where ? `\`${e.where}\`` : "—"} |`);
    });
    L.push("");
  }

  return L.join("\n");
}
