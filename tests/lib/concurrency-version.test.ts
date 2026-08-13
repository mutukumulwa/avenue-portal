import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { matchesExpectedState, readExpectedState, EXPECTED_VERSION_FIELD, EXPECTED_UPDATED_AT_FIELD } from "@/lib/concurrency";

/**
 * UAT-HF P05.01 (completion) — the precondition reads the row version.
 *
 * P05.05's recorded risk: "The precondition uses `updatedAt`, not the integer
 * `version` P05.01 adds; two saves inside the same millisecond would both
 * pass." The column has been incremented since P04.05 and nothing read it.
 *
 * Two operators saving the same member from a queue land in the same
 * millisecond often enough to matter, and the outcome is exactly DEF-077 — a
 * field reverted that neither operator intended to touch.
 */

const AT = "2026-08-13T10:00:00.000Z";

describe("expected-state matching with a row version", () => {
  it("rejects a save whose version is behind, even at the identical timestamp", () => {
    // The whole point: same millisecond, different version.
    expect(
      matchesExpectedState({ updatedAt: AT, version: 4 }, { updatedAt: AT, version: 5 }),
    ).toBe(false);
  });

  it("accepts a save when both the timestamp and the version match", () => {
    expect(
      matchesExpectedState({ updatedAt: AT, version: 5 }, { updatedAt: AT, version: 5 }),
    ).toBe(true);
  });

  it("still rejects on the timestamp when versions agree", () => {
    // A row written by a path that bumps updatedAt without touching version
    // must not slip through a version-only check.
    expect(
      matchesExpectedState(
        { updatedAt: AT, version: 5 },
        { updatedAt: "2026-08-13T10:00:00.001Z", version: 5 },
      ),
    ).toBe(false);
  });

  it("degrades to timestamp-only when the client sent no version", () => {
    // A form not yet carrying the hidden field keeps its previous behaviour
    // rather than failing every save.
    expect(matchesExpectedState({ updatedAt: AT }, { updatedAt: AT, version: 9 })).toBe(true);
  });

  it("parses the version out of form data", () => {
    const fd = new FormData();
    fd.set(EXPECTED_UPDATED_AT_FIELD, AT);
    fd.set(EXPECTED_VERSION_FIELD, "7");
    expect(readExpectedState(fd)?.version).toBe(7);
  });

  it("ignores a non-integer version rather than sending NaN to the database", () => {
    const fd = new FormData();
    fd.set(EXPECTED_UPDATED_AT_FIELD, AT);
    fd.set(EXPECTED_VERSION_FIELD, "not-a-number");
    expect(readExpectedState(fd)?.version).toBeUndefined();
  });
});

describe("the member update actually applies it", () => {
  const service = readFileSync("src/server/services/members.service.ts", "utf8");

  it("puts the version in the WHERE clause, not in a read-then-write check", () => {
    expect(service).toContain("...(exp.version !== undefined ? { version: exp.version } : {})");
  });

  it("still compares updatedAt as well", () => {
    expect(service).toContain("updatedAt: new Date(exp.updatedAt)");
  });

  it("the edit form sends the version it loaded", () => {
    const form = readFileSync("src/app/(admin)/members/[id]/edit/MemberEditForm.tsx", "utf8");
    expect(form).toContain("name={EXPECTED_VERSION_FIELD}");
    expect(form).toContain("value={member.version}");
  });
});
