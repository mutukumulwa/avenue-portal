/**
 * UAT-HF P04.05 acceptance — "two-device edits create an explicit conflict and
 * preserve both submitted/current values."
 *
 * DEF-077, reproduced exactly as the run recorded it: staff A changes
 * `otherNames` "" -> "AWinsFirst" and saves; staff B, holding the copy loaded
 * before A saved, changes `lastName` and saves. B's save succeeded, A's change
 * vanished, and a field neither operator touched was reverted.
 */
import { describe, it, expect } from "vitest";
import {
  EXPECTED_UPDATED_AT_FIELD,
  EXPECTED_VERSION_FIELD,
  applyWithPrecondition,
  changedFields,
  describeConflict,
  matchesExpectedState,
  readExpectedState,
} from "@/lib/concurrency";
import { mutationConflict } from "@/lib/mutation-contract";

const LOADED = new Date("2026-08-12T09:00:00.000Z");
const AFTER_A_SAVED = new Date("2026-08-12T09:01:00.000Z");

// The record as both operators loaded it.
const ORIGINAL = { firstName: "Valid", otherNames: "", lastName: "StaleWrite" };
// A saved first.
const CURRENT = { firstName: "Valid", otherNames: "AWinsFirst", lastName: "StaleWrite" };
// B submits the whole record from its stale copy, having changed lastName only.
const B_SUBMITTED = { firstName: "Valid", otherNames: "", lastName: "StaleTwo" };

describe("P04.05 the precondition", () => {
  it("holds when nothing has moved", () => {
    expect(matchesExpectedState({ updatedAt: LOADED }, { updatedAt: LOADED })).toBe(true);
  });

  it("fails once somebody else has saved", () => {
    expect(matchesExpectedState({ updatedAt: LOADED }, { updatedAt: AFTER_A_SAVED })).toBe(false);
  });

  it("compares to the millisecond, not loosely", () => {
    const off = new Date(LOADED.getTime() + 1);
    expect(matchesExpectedState({ updatedAt: LOADED }, { updatedAt: off })).toBe(false);
  });

  it("accepts an ISO string, which is how it crosses the wire", () => {
    expect(matchesExpectedState({ updatedAt: LOADED.toISOString() }, { updatedAt: LOADED })).toBe(true);
  });

  it("also checks a row version when both sides have one", () => {
    expect(matchesExpectedState({ updatedAt: LOADED, version: 3 }, { updatedAt: LOADED, version: 3 })).toBe(true);
    expect(matchesExpectedState({ updatedAt: LOADED, version: 3 }, { updatedAt: LOADED, version: 4 })).toBe(false);
  });

  it("treats an unparseable timestamp as a failed precondition, never a pass", () => {
    // Fail closed: an expectation we cannot evaluate must not authorise a write.
    expect(matchesExpectedState({ updatedAt: "nonsense" }, { updatedAt: LOADED })).toBe(false);
    expect(matchesExpectedState({ updatedAt: LOADED }, { updatedAt: "nonsense" })).toBe(false);
  });
});

describe("P04.05 reading the expectation off the form", () => {
  const form = (values: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) fd.set(k, v);
    return fd;
  };

  it("reads updatedAt and version", () => {
    const state = readExpectedState(
      form({ [EXPECTED_UPDATED_AT_FIELD]: LOADED.toISOString(), [EXPECTED_VERSION_FIELD]: "7" }),
    );
    expect(state?.version).toBe(7);
    expect(new Date(state!.updatedAt).getTime()).toBe(LOADED.getTime());
  });

  it("returns null when the form carries no expectation at all", () => {
    // A form that does not say what it expected cannot be saved safely, and the
    // caller must refuse rather than write blind.
    expect(readExpectedState(form({}))).toBeNull();
    expect(readExpectedState(form({ [EXPECTED_UPDATED_AT_FIELD]: "   " }))).toBeNull();
  });

  it("returns null for an unparseable timestamp", () => {
    expect(readExpectedState(form({ [EXPECTED_UPDATED_AT_FIELD]: "yesterday" }))).toBeNull();
  });

  it("ignores a non-integer version rather than guessing", () => {
    const state = readExpectedState(
      form({ [EXPECTED_UPDATED_AT_FIELD]: LOADED.toISOString(), [EXPECTED_VERSION_FIELD]: "3.5" }),
    );
    expect(state?.version).toBeUndefined();
  });
});

describe("P04.05 DEF-077 — the conflict preserves both sides", () => {
  const conflict = describeConflict({
    entity: "member",
    original: ORIGINAL,
    submitted: B_SUBMITTED,
    current: CURRENT,
    currentUpdatedAt: AFTER_A_SAVED,
  });

  it("reports both fields that disagree with the record", () => {
    expect(conflict.fields.map((f) => f.field).sort()).toEqual(["lastName", "otherNames"]);
  });

  it("keeps B's typed value, so their work is not thrown away", () => {
    const lastName = conflict.fields.find((f) => f.field === "lastName");
    expect(lastName?.submitted).toBe("StaleTwo");
    expect(lastName?.current).toBe("StaleWrite");
    expect(lastName?.untouched).toBe(false);
  });

  it("marks A's change as one B never touched", () => {
    // This is the field the run watched get silently reverted.
    const otherNames = conflict.fields.find((f) => f.field === "otherNames");
    expect(otherNames?.untouched).toBe(true);
    expect(otherNames?.current).toBe("AWinsFirst");
    expect(otherNames?.submitted).toBe("");
  });

  it("says nothing about fields that agree", () => {
    expect(conflict.fields.some((f) => f.field === "firstName")).toBe(false);
  });

  it("records when the record actually changed", () => {
    expect(conflict.currentUpdatedAt).toBe(AFTER_A_SAVED.toISOString());
  });

  it("treats whitespace-only differences as no difference", () => {
    const c = describeConflict({
      entity: "member",
      original: { a: "x" },
      submitted: { a: " x " },
      current: { a: "x" },
    });
    expect(c.fields).toHaveLength(0);
  });

  it("treats null, undefined and empty string as the same absence", () => {
    const c = describeConflict({
      entity: "member",
      original: { a: null },
      submitted: { a: "" },
      current: { a: undefined },
    });
    expect(c.fields).toHaveLength(0);
  });

  it("reports no conflict at all when the record has not moved", () => {
    const c = describeConflict({
      entity: "member",
      original: ORIGINAL,
      submitted: B_SUBMITTED,
      current: B_SUBMITTED,
    });
    expect(c.fields).toHaveLength(0);
  });
});

describe("P04.05 only the fields this operator changed may be written", () => {
  it("returns B's one real edit, not the whole stale record", () => {
    // The second half of DEF-077: even with a precondition, writing every field
    // from a stale copy reverts what the operator never touched.
    expect(changedFields(ORIGINAL, B_SUBMITTED)).toEqual({ lastName: "StaleTwo" });
  });

  it("is empty when nothing was edited", () => {
    expect(changedFields(ORIGINAL, { ...ORIGINAL })).toEqual({});
  });

  it("counts clearing a field as a change", () => {
    expect(changedFields({ a: "x" }, { a: "" })).toEqual({ a: "" });
  });
});

describe("P04.05 the conditional write", () => {
  it("APPLIED when the update matched a row", async () => {
    const outcome = await applyWithPrecondition(async () => ({ count: 1 }), { updatedAt: LOADED });
    expect(outcome).toBe("APPLIED");
  });

  it("STALE when it matched none — and nothing was written", async () => {
    const outcome = await applyWithPrecondition(async () => ({ count: 0 }), { updatedAt: LOADED });
    expect(outcome).toBe("STALE");
  });

  it("passes the expectation through to the update, so it reaches the WHERE clause", async () => {
    let seen: unknown;
    await applyWithPrecondition(
      async (args) => {
        seen = args.expected;
        return { count: 1 };
      },
      { updatedAt: LOADED, version: 2 },
    );
    expect(seen).toEqual({ updatedAt: LOADED, version: 2 });
  });
});

describe("P04.05 the conflict result", () => {
  const conflict = describeConflict({
    entity: "member",
    original: ORIGINAL,
    submitted: B_SUBMITTED,
    current: CURRENT,
  });

  it("is a CONFLICT that is never automatically retried", () => {
    const result = mutationConflict(conflict);
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("CONFLICT");
    // Retrying would re-submit the same stale copy and lose A's change again.
    expect(result.retryable).toBe(false);
  });

  it("carries the comparison so the UI can show both sides", () => {
    expect(mutationConflict(conflict).conflict?.fields).toHaveLength(2);
  });

  it("says plainly that nothing was saved", () => {
    // The operator's first question is "did some of it go through?"
    expect(mutationConflict(conflict).message).toMatch(/NOT saved/);
  });

  it("warns when fields the operator never touched have also moved", () => {
    expect(mutationConflict(conflict).message).toMatch(/did not touch have moved/i);
  });

  it("omits that warning when every difference is the operator's own", () => {
    const own = describeConflict({
      entity: "member",
      original: ORIGINAL,
      submitted: { ...ORIGINAL, lastName: "StaleTwo" },
      current: ORIGINAL,
    });
    expect(mutationConflict(own).message).not.toMatch(/did not touch/i);
  });

  it("carries a quotable correlation id like every other failure", () => {
    expect(mutationConflict(conflict).correlationId).toMatch(/^cor_/);
  });
});
