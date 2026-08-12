/**
 * UAT-HF P04.05 — optimistic concurrency and the conflict record.
 *
 * DEF-077: "Two different staff accounts opened the same member edit form.
 * Staff A changed otherNames ... and saved successfully. Staff B, still holding
 * the copy loaded before A saved, changed a different field and saved. B's save
 * SUCCEEDED with no conflict banner ... A's committed change was gone. B's
 * whole-form submit wrote every field from its stale copy, so a field neither
 * operator intended to touch was reverted."
 *
 * Two separate faults, and fixing either alone leaves the other:
 *
 *   1. **No precondition.** The update did not say what it expected to find, so
 *      it could not notice that the world had moved.
 *   2. **Whole-record writes.** Even with a precondition, submitting every field
 *      from a stale copy reverts fields the operator never touched.
 *
 * So this module provides a precondition token AND a changed-field diff, and the
 * conflict it produces carries *both* values — the acceptance requires that a
 * rejected save "preserve both submitted/current values" rather than throwing
 * the operator's work away in the act of protecting the record.
 */

/**
 * What the client believed about a record when it loaded it.
 *
 * `updatedAt` is used rather than a version integer because every model already
 * has it; a model that later gains a real `version` column can carry both.
 */
export interface ExpectedState {
  /** The record's `updatedAt` as the client last saw it, ISO or Date. */
  updatedAt: string | Date;
  /** Optional monotonic row version, where the model has one. */
  version?: number;
}

/** Hidden form field carrying `updatedAt` from the loaded copy back to the server. */
export const EXPECTED_UPDATED_AT_FIELD = "__expectedUpdatedAt";
/** Hidden form field carrying the row version, for models that have one. */
export const EXPECTED_VERSION_FIELD = "__expectedVersion";

export interface FieldConflict {
  field: string;
  /** What this operator typed. Never discarded — they must be able to re-apply it. */
  submitted: string;
  /** What the record says now, after somebody else's save. */
  current: string;
  /**
   * True when the operator did not actually change this field, so the difference
   * is entirely somebody else's edit. These must never be written back: that is
   * how DEF-077 reverted a field "neither operator intended to touch".
   */
  untouched: boolean;
}

export interface ConflictDetail {
  /** Human-readable name of the thing that changed, e.g. "member". */
  entity: string;
  /** When the record was actually last changed. */
  currentUpdatedAt?: string;
  /** Every field that differs between the submitted copy and the record. */
  fields: FieldConflict[];
}

/** Parse an expected-state token out of submitted form data. */
export function readExpectedState(formData: {
  get(name: string): FormDataEntryValue | null;
}): ExpectedState | null {
  const raw = formData.get(EXPECTED_UPDATED_AT_FIELD);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  const versionRaw = formData.get(EXPECTED_VERSION_FIELD);
  const version =
    typeof versionRaw === "string" && versionRaw.trim() !== "" ? Number(versionRaw) : undefined;

  return {
    updatedAt: parsed,
    ...(version !== undefined && Number.isInteger(version) ? { version } : {}),
  };
}

/** Whether the record is still exactly where the client left it. */
export function matchesExpectedState(
  expected: ExpectedState,
  actual: { updatedAt: Date | string; version?: number },
): boolean {
  const expectedAt = new Date(expected.updatedAt).getTime();
  const actualAt = new Date(actual.updatedAt).getTime();
  if (Number.isNaN(expectedAt) || Number.isNaN(actualAt)) return false;

  // Compare to the millisecond. `updatedAt` round-trips through JSON as an ISO
  // string, which is millisecond-precise, so this is exact rather than fuzzy.
  if (expectedAt !== actualAt) return false;

  if (expected.version !== undefined && actual.version !== undefined) {
    return expected.version === actual.version;
  }
  return true;
}

/**
 * Build the conflict record for a rejected save.
 *
 * `original` is the copy the client loaded, `submitted` is what they are trying
 * to save, and `current` is what the record says now. Comparing all three is
 * what distinguishes "this operator changed it" from "somebody else did", which
 * is the distinction DEF-077's whole-record write destroyed.
 */
export function describeConflict(input: {
  entity: string;
  original: Record<string, string | null | undefined>;
  submitted: Record<string, string | null | undefined>;
  current: Record<string, string | null | undefined>;
  currentUpdatedAt?: Date | string;
  /** Only report on these fields, in this order. Defaults to the submitted keys. */
  fields?: readonly string[];
}): ConflictDetail {
  const names = input.fields ?? Object.keys(input.submitted);
  const fields: FieldConflict[] = [];

  for (const field of names) {
    const original = norm(input.original[field]);
    const submitted = norm(input.submitted[field]);
    const current = norm(input.current[field]);

    // No disagreement with the record: nothing to report, whoever changed it.
    if (submitted === current) continue;

    fields.push({
      field,
      submitted,
      current,
      // The operator left this field alone; the whole difference is the other
      // person's edit, and writing our copy back would silently revert it.
      untouched: submitted === original,
    });
  }

  return {
    entity: input.entity,
    ...(input.currentUpdatedAt
      ? { currentUpdatedAt: new Date(input.currentUpdatedAt).toISOString() }
      : {}),
    fields,
  };
}

/**
 * The fields this operator actually changed — the only ones a save may write.
 *
 * DEF-077's second fault in one function: submitting the whole record from a
 * stale copy reverts everything the operator did not touch.
 */
export function changedFields<T extends Record<string, string | null | undefined>>(
  original: T,
  submitted: T,
): Partial<T> {
  const out: Record<string, string | null | undefined> = {};
  for (const key of Object.keys(submitted)) {
    if (norm(original[key]) !== norm(submitted[key])) out[key] = submitted[key];
  }
  return out as Partial<T>;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/**
 * Result of a conditional write.
 *
 * `STALE` means the precondition did not hold, so **nothing was written** — the
 * caller must report a conflict rather than retrying blindly.
 */
export type PreconditionOutcome = "APPLIED" | "STALE";

/**
 * Apply a conditional update, returning STALE when the precondition failed.
 *
 * The precondition lives in the WHERE clause so the check and the write are one
 * statement. Reading the row first and then updating it leaves exactly the race
 * this is meant to close.
 */
export async function applyWithPrecondition(
  update: (args: { expected: ExpectedState }) => Promise<{ count: number }>,
  expected: ExpectedState,
): Promise<PreconditionOutcome> {
  const result = await update({ expected });
  return result.count > 0 ? "APPLIED" : "STALE";
}
