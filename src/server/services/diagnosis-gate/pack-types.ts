/**
 * Diagnosis Gate — canonical protocol-pack shape (C1.3).
 *
 * A "pack" is the ENTIRE clinical content set for one tenant, versioned and immutable
 * once approved (DG-D6). This module defines the wire/file format that sits between the
 * clinical team's workbook and the database:
 *
 *   workbook.xlsx --[scripts/diagnosis-gate/convert-workbook.ts]--> pack.json
 *   pack.json     --[pack-validate.ts]--> errors/warnings
 *   pack.json     --[ProtocolPackService.createDraftFromImport]--> DRAFT rows
 *
 * Keeping the format explicit (rather than importing the xlsx server-side) means the
 * thing that gets reviewed, diffed in git, and approved by a checker is a small,
 * readable, deterministic artifact — not a binary spreadsheet.
 *
 * ANTI-HALLUCINATION CONTRACT (plan §0.2 / DG-D7): every field here originates from a
 * cell in a vendored workbook. The converter never invents a value to fill a gap; a
 * missing or ambiguous source value becomes a validation issue instead.
 */

export const PACK_FORMAT_VERSION = 1;

export type CodeSystem = "ICD10" | "ICD11";
export type MappingProvenance = "AUTHORED" | "GENERATED_CROSSWALK";
export type LabLinkType = "SUPPORTED" | "CONFIRMATORY";
export type AliasMatchType = "CPT_CODE" | "SERVICE_CODE" | "NORMALIZED_NAME";

export interface PackGroup {
  /** Stable key (DG-D2). Display names are never keys — they differ across sheets. */
  groupCode: string;
  name: string;
  description?: string;
  /** DG-D8: a category, not a diagnosis. Barred from live routing forever. */
  isCatchAll: boolean;
  /** R4 lookback; null/undefined = the confirmatory test must be on THIS claim. */
  confirmationLookbackHours?: number | null;
  /** Provenance back into the workbook (e.g. "Commonest!A7"). */
  sourceRow?: string;
}

export interface PackMembership {
  groupCode: string;
  codeSystem: CodeSystem;
  code: string;
  provenance: MappingProvenance;
  note?: string;
}

export interface PackLabRule {
  testCode: string;
  testName: string;
  department?: string;
  /** R2 applies only when true. */
  requiresDiagnosis: boolean;
  /** R3 window; null = no repeat control for this test. */
  repeatWindowHours?: number | null;
  /** Provider-facing text, verbatim from the workbook. */
  failureMessage: string;
  auditRule?: string;
  sourceRow?: string;
}

export interface PackLink {
  testCode: string;
  groupCode: string;
  linkType: LabLinkType;
}

export interface PackAlias {
  testCode: string;
  matchType: AliasMatchType;
  /** Normalised via `normaliseAliasValue` before it ever reaches this shape. */
  value: string;
}

export interface PackMeta {
  formatVersion: number;
  /** Vendored source filename, e.g. ICD11_Codes_Mapped_with_Clinical_Features_v0.xlsx */
  sourceFileName: string;
  /** sha256 of the source workbook bytes — ties a pack to exactly one source file. */
  sourceFileChecksum?: string;
  /** Free-text note from whoever ran the conversion. */
  notes?: string;
}

export interface ProtocolPack {
  meta: PackMeta;
  groups: PackGroup[];
  memberships: PackMembership[];
  labRules: PackLabRule[];
  links: PackLink[];
  aliases: PackAlias[];
}

// ── Normalisation ────────────────────────────────────────────────────────────
// Used identically by the converter (writing aliases) and the CLINICAL stage
// (matching claim lines). If these ever diverge, rules silently stop matching —
// so both sides import from here.

/** Alias / claim-line matching key: uppercase, trimmed, whitespace collapsed. */
export function normaliseAliasValue(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Code key: uppercase, all whitespace removed (ICD codes never contain spaces). */
export function normaliseCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/**
 * Loose identity key for matching the SAME condition name across sheets that spell it
 * differently in case/punctuation only (e.g. "OtitisExterna" vs "Otitis Externa").
 * This deliberately does NOT correct spelling ("Tonsilitis" ≠ "Tonsillitis") or resolve
 * synonyms ("Acne" ≠ "Acne Vulgaris") — those are content decisions for the clinical
 * team, surfaced as unresolved-name issues rather than guessed at.
 */
export function looseNameKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ── Repeat/lookback window arithmetic (DG-D14) ───────────────────────────────
// A claim carries `dateOfService` at DATE resolution — there is no time of day. So a
// window shorter than a day cannot be evaluated: under a 4-hour window two same-day
// claims would ALWAYS flag (even 8 hours apart) and two claims 2 hours apart either
// side of midnight would NEVER flag. Both directions are wrong, so sub-day windows are
// treated as unenforceable and recorded as inert rather than guessed at.
//
// Windows of a day or more are compared in whole calendar days, which is exactly the
// resolution the data actually has.

/** Below this, a window cannot be evaluated on date-only claim data (DG-D14). */
export const MIN_ENFORCEABLE_WINDOW_HOURS = 24;

/** Whole days a window covers. 24h→1, 72h→3, 720h→30. */
export function windowDays(hours: number): number {
  return Math.floor(hours / 24);
}

/** True when the window is too short to evaluate against date-only data (DG-D14). */
export function isSubDayWindow(hours: number | null | undefined): boolean {
  return hours != null && hours > 0 && hours < MIN_ENFORCEABLE_WINDOW_HOURS;
}

/** Midnight-UTC floor, so day differences are not skewed by any time component. */
export function floorToUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole days between two service dates (positive when `later` is after `earlier`). */
export function dayDifference(later: Date, earlier: Date): number {
  return Math.round((floorToUtcDay(later) - floorToUtcDay(earlier)) / 86_400_000);
}

/** Deterministic ordering so two conversions of one workbook are byte-identical. */
export function canonicalisePack(pack: ProtocolPack): ProtocolPack {
  const by =
    <T>(...keys: Array<(x: T) => string | number>) =>
    (a: T, b: T): number => {
      for (const k of keys) {
        const ka = k(a);
        const kb = k(b);
        if (ka < kb) return -1;
        if (ka > kb) return 1;
      }
      return 0;
    };

  return {
    meta: { ...pack.meta, formatVersion: PACK_FORMAT_VERSION },
    groups: [...pack.groups].sort(by<PackGroup>((g) => g.groupCode)),
    memberships: [...pack.memberships].sort(
      by<PackMembership>((m) => m.groupCode, (m) => m.codeSystem, (m) => m.code),
    ),
    labRules: [...pack.labRules].sort(by<PackLabRule>((r) => r.testCode)),
    links: [...pack.links].sort(by<PackLink>((l) => l.testCode, (l) => l.groupCode, (l) => l.linkType)),
    aliases: [...pack.aliases].sort(by<PackAlias>((a) => a.matchType, (a) => a.value, (a) => a.testCode)),
  };
}

/** Stable JSON for checksumming and for git-friendly diffs. */
export function serialisePack(pack: ProtocolPack): string {
  return JSON.stringify(canonicalisePack(pack), null, 2) + "\n";
}
