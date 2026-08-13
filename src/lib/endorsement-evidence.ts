/**
 * UAT-HF P08.03 — the E-015 material-evidence contract, in one place (DEF-046).
 *
 * The run raised three endorsements and could not approve any of them:
 *
 *   "Every approval attempt is refused with 'Material change control (E-015): a
 *   source reference or supporting document is required before this endorsement
 *   can be approved.' A fresh endorsement was raised with the Notes field
 *   carrying an explicit source reference and supporting-document citation — the
 *   text renders on the detail page — and E-015 still refused. A full
 *   enumeration of the endorsement detail found exactly one input on the whole
 *   page: a text box placeholdered 'Rejection reason'."
 *
 * ## The mechanism
 *
 * `assertMaterialEvidence` reads `changeDetails.sourceReference`,
 * `.documentReference` or `.docRef`. The admin creation form writes neither: it
 * writes `notes`, which the gate does not accept, and `docRef` — but `docRef`
 * only on `CORRECTION`, which is **not** a material type and therefore never
 * needed evidence in the first place. So the one type with a reference field did
 * not require one, and the eleven that require one had no field.
 *
 * Every material endorsement raised through the admin UI was therefore born
 * unapprovable. That is not a validation gap at the approval step; it is a
 * missing field at the creation step, which is why P08.03 fixes it there:
 * "incomplete request cannot enter an unapprovable state".
 *
 * ## Why this module exists rather than a field on the form
 *
 * The rule now has four readers — the creation form (which must mark the field
 * required), the creation action (which must refuse), the detail page (which
 * must show the checker what they are relying on), and the service gate (which
 * is the backstop). Four copies of "which types are material" is four chances to
 * drift, and the drift would be silent: the form would let a request through
 * that the gate later refuses, recreating this defect exactly.
 *
 * The service keeps its own `isMaterialAmendment` because it is derived from
 * `AMENDMENT_RULES` — the single source. This module re-exports that derivation
 * for callers that must not import server-only code.
 */

/**
 * The keys `assertMaterialEvidence` accepts, in priority order.
 *
 * `sourceReference` is what new writes use. The other two are read for
 * compatibility with rows already in the database — `docRef` from the CORRECTION
 * form, `documentReference` from the amendment service's own callers.
 */
export const EVIDENCE_KEYS = ["sourceReference", "documentReference", "docRef"] as const;

/**
 * Material endorsement types — those with pro-rata or requiring assessment.
 *
 * Mirrors `isMaterialAmendment` in `amendment.service.ts`, which derives it from
 * `AMENDMENT_RULES`. `tests/lib/endorsement-evidence.test.ts` pins the two
 * together so this list cannot silently fall out of step with the gate that
 * actually refuses the approval.
 */
export const MATERIAL_ENDORSEMENT_TYPES = new Set<string>([
  "DEPENDENT_ADDITION",
  "DEPENDENT_DELETION",
  "MEMBER_ADDITION",
  "MEMBER_DELETION",
  "PACKAGE_UPGRADE",
  "PACKAGE_DOWNGRADE",
  "TIER_CHANGE",
  "SCHEME_TRANSFER",
  "MID_TERM_RATE_CHANGE",
  "AGE_BAND_CHANGE",
  "SALARY_CHANGE",
]);

/** Does this type need evidence before it can be approved? */
export function requiresEvidence(type: string): boolean {
  return MATERIAL_ENDORSEMENT_TYPES.has(type);
}

/** The evidence recorded on a change, or null. Reads every accepted key. */
export function readEvidence(changeDetails: unknown): string | null {
  const details = (changeDetails ?? {}) as Record<string, unknown>;
  for (const key of EVIDENCE_KEYS) {
    const value = details[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

export const MAX_EVIDENCE_LEN = 120;

/** The label and help text, so every surface asks for the same thing. */
export const EVIDENCE_LABEL = "Source reference or supporting document";
export const EVIDENCE_HELP =
  "The board resolution, HR letter, payroll instruction or scheme correspondence authorising this change. Required before a checker can approve it.";
export const EVIDENCE_PLACEHOLDER = "e.g. HR letter dated 2026-08-11, ref HR/2026/114";

export type EvidenceCheck =
  | { ok: true; value: string | null }
  | { ok: false; message: string };

/**
 * Validate evidence at the point of creation.
 *
 * Deliberately strict about *when* it applies: a non-material type is exempt, so
 * a contact-detail or group-data edit is not made harder for no governance
 * benefit. Requiring evidence everywhere would train operators to type "n/a",
 * which is worse than not asking — the field would still be populated and the
 * gate would still pass.
 */
export function validateEvidence(input: {
  type: string;
  sourceReference?: string | null;
  /** True when a supporting Document is already linked — that satisfies E-015 too. */
  hasLinkedDocument?: boolean;
}): EvidenceCheck {
  const raw = (input.sourceReference ?? "").trim();

  if (!requiresEvidence(input.type)) {
    return { ok: true, value: raw === "" ? null : raw };
  }

  if (raw === "") {
    if (input.hasLinkedDocument) return { ok: true, value: null };
    return {
      ok: false,
      message:
        "This change moves money or eligibility, so it needs a source reference before a checker can approve it. Enter the letter, resolution or instruction that authorises it.",
    };
  }

  if (raw.length > MAX_EVIDENCE_LEN) {
    return {
      ok: false,
      message: `Use ${MAX_EVIDENCE_LEN} characters or fewer for the source reference.`,
    };
  }

  return { ok: true, value: raw };
}
