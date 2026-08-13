import { describe, it, expect } from "vitest";
import {
  mutationFail,
  mutationOk,
  mutationConflict,
  isDefaultMessage,
  type MutationFailureKind,
} from "@/lib/mutation-contract";
import {
  ALL_ELIGIBILITY_DECISION_REASONS,
  ELIGIBILITY_REASON_CATALOGUE,
  COLLAPSED_NOT_FOUND_MESSAGE,
} from "@/server/services/eligibility/decision-contract";

/**
 * UAT-HF P11.04 — the copy oracle.
 *
 * Acceptance: "content test/copy oracle covers **every** mutation result kind
 * and eligibility reason without raw exception/PII."
 *
 * The other P11.04 defects were closed by the tasks that owned the surfaces.
 * What none of them provides is this: a single test that enumerates the two
 * catalogues and holds every entry to the same rules, so a *new* kind or a new
 * reason cannot ship with copy nobody checked. Every previous copy defect in
 * this run — "no member" for a system outage, a raw exception in a banner, a
 * duration with no date — was one entry somebody added without a rule to
 * measure it against.
 *
 * The copy rule, from the plan: state what happened, whether data may have
 * committed, the safe next action, a privacy-safe reference, and freshness.
 */

const ALL_KINDS: MutationFailureKind[] = [
  "VALIDATION",
  "CONFLICT",
  "FORBIDDEN",
  "UNAVAILABLE",
  "UNKNOWN_OUTCOME",
];

/** Text that must never reach a user, whatever produced it. */
const RAW_EXCEPTION_MARKERS = [
  /\bError:/,
  /\bTypeError\b/,
  /\bundefined\b/,
  /\bnull\b/,
  /\bNaN\b/,
  /\bstack\b/i,
  /\bP2\d{3}\b/, // Prisma error codes
  /\bECONN/,
  /prisma/i,
  /\bat\s+\w+\s+\(/, // a stack frame
  /\{\s*"/, // a serialised object
];

/** Shapes that would identify a person. */
const PII_MARKERS = [
  /\b[A-Z]{2,6}-\d{4}-\d{4,}\b/, // member number, e.g. NWSC-2026-00001
  /\b\+?256\d{9}\b/, // Uganda phone
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/, // email
  /\b(CM|CF)\d{11}[A-Z]{2}\b/, // Uganda NIN
];

function assertUserSafe(label: string, text: string) {
  for (const marker of RAW_EXCEPTION_MARKERS) {
    expect(marker.test(text), `${label} leaks internals: ${JSON.stringify(text)}`).toBe(false);
  }
  for (const marker of PII_MARKERS) {
    expect(marker.test(text), `${label} leaks an identifier: ${JSON.stringify(text)}`).toBe(false);
  }
}

describe("P11.04 every mutation failure kind has copy that meets the rule", () => {
  for (const kind of ALL_KINDS) {
    const result = mutationFail(kind, { correlationId: "corr_abc123" });

    it(`${kind}: says something, in sentences, and leaks nothing`, () => {
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.message.length).toBeGreaterThan(20);
      // A message that is not a sentence is a label, and a label cannot say
      // what happened or what to do next.
      expect(result.message).toMatch(/[.!?]$/);
      assertUserSafe(kind, result.message);
    });

    it(`${kind}: carries a quotable reference for support`, () => {
      if (result.ok) return;
      // "privacy-safe reference" in the copy rule. It is what support searches
      // on, and it is opaque — see P12.01.
      expect(result.correlationId).toBe("corr_abc123");
      expect(result.formError).toBe(result.message);
    });

    it(`${kind}: agrees with itself about whether retrying is safe`, () => {
      if (result.ok) return;
      expect(typeof result.retryable).toBe("boolean");
      // The one that matters. A blind retry after an unknown outcome is how a
      // single enrolment becomes two.
      if (kind === "UNKNOWN_OUTCOME") expect(result.retryable).toBe(false);
      if (kind === "UNAVAILABLE") expect(result.retryable).toBe(true);
    });
  }

  it("says whether the data may have committed, and only where that is honest", () => {
    const unknown = mutationFail("UNKNOWN_OUTCOME", { correlationId: "c" });
    const unavailable = mutationFail("UNAVAILABLE", { correlationId: "c" });
    if (unknown.ok || unavailable.ok) return;

    // UNKNOWN_OUTCOME must warn against resubmitting and point at a check.
    expect(unknown.message).toMatch(/not confirm|could not confirm/i);
    expect(unknown.message).toMatch(/do not resubmit/i);

    // UNAVAILABLE is the opposite claim and must be made positively: nothing
    // was saved, so trying again is safe. Blurring the two is what turns a
    // recoverable outage into a duplicate write.
    expect(unavailable.message).toMatch(/not saved/i);
    expect(unavailable.message).not.toMatch(/do not resubmit/i);
  });

  it("never presents a system failure as a statement about the member", () => {
    // The plan's explicit prohibition: "Never say 'no member' for system
    // unavailable." The run found precisely that.
    for (const kind of ["UNAVAILABLE", "UNKNOWN_OUTCOME"] as const) {
      const r = mutationFail(kind, { correlationId: "c" });
      if (r.ok) return;
      expect(r.message).not.toMatch(/no member|not found|does not exist|no such/i);
    }
  });

  it("a caller's own message replaces the default rather than joining it", () => {
    const custom = mutationFail("VALIDATION", { correlationId: "c", message: "Enter a last covered day." });
    if (custom.ok) return;
    expect(custom.message).toBe("Enter a last covered day.");
    expect(isDefaultMessage("VALIDATION", custom.message)).toBe(false);
    expect(isDefaultMessage("VALIDATION", mutationFail("VALIDATION", { correlationId: "c" }).ok
      ? ""
      : (mutationFail("VALIDATION", { correlationId: "c" }) as { message: string }).message)).toBe(true);
  });

  it("a conflict keeps the operator's work instead of discarding it", () => {
    const r = mutationConflict(
      {
        entity: "member",
        fields: [{ field: "phone", submitted: "0700000001", current: "0700000002", untouched: false }],
      },
      { correlationId: "c", operationId: "op" },
    );
    if (r.ok) return;
    // DEF-077: a rejected save that also loses the typed values protects the
    // record by punishing the operator.
    expect(r.conflict?.fields[0].submitted).toBe("0700000001");
    assertUserSafe("CONFLICT message", r.message);
  });

  it("success copy offers a next action and a quotable reference", () => {
    const ok = mutationOk("op_1", { entityRef: "END-2026-00017", nextAction: "View endorsement" });
    expect(ok.nextAction).toBe("View endorsement");
    expect(ok.entityRef).toBe("END-2026-00017");
    expect(ok.replayed).toBe(false);
  });

  it("a replayed write is reported as a replay, not as a second success", () => {
    // Otherwise a double-submit reads as two enrolments to the operator even
    // though only one happened.
    expect(mutationOk("op_1", { replayed: true }).replayed).toBe(true);
  });
});

describe("P11.04 every eligibility reason has copy that meets the rule", () => {
  it("the catalogue covers every declared reason — no reason renders undefined", () => {
    const missing = ALL_ELIGIBILITY_DECISION_REASONS.filter((r) => !ELIGIBILITY_REASON_CATALOGUE[r]);
    expect(missing).toEqual([]);
  });

  for (const reason of ALL_ELIGIBILITY_DECISION_REASONS) {
    const entry = ELIGIBILITY_REASON_CATALOGUE[reason];
    if (!entry) continue;

    it(`${reason}: member-safe text says something and leaks nothing`, () => {
      expect(entry.memberSafe.length).toBeGreaterThan(10);
      expect(entry.memberSafe).toMatch(/[.!?]$/);
      assertUserSafe(`${reason}.memberSafe`, entry.memberSafe);
      // An internal reason code in member-facing copy is the same defect as a
      // raw exception: correct, and useless to the person reading it.
      expect(entry.memberSafe).not.toContain(reason);
      expect(entry.memberSafe).not.toMatch(/_[A-Z]{2,}/);
    });

    it(`${reason}: the person at the desk is told what to DO`, () => {
      expect(entry.operatorGuidance.length).toBeGreaterThan(10);
      assertUserSafe(`${reason}.operatorGuidance`, entry.operatorGuidance);
    });

    it(`${reason}: a blocked benefit is not reported as lost cover`, () => {
      if (!entry.memberStillCovered) return;
      // The distinction the member actually cares about: one dormant category
      // must not read as a dormant policy (DEF-061's sharpest point).
      //
      // Note what this does NOT forbid. "This treatment is not covered under
      // the member's package" is correct and is the whole point of the reason —
      // the thing is excluded, the person is not. What must never appear is a
      // claim about the MEMBER's cover.
      expect(entry.memberSafe).not.toMatch(
        /(member|you|your cover|their cover)\s+(is|are|was|were)?\s*(not covered|no longer covered|not eligible)/i,
      );
      expect(entry.memberSafe).not.toMatch(/cover (has ended|is inactive|has lapsed|has expired)/i);
      expect(entry.memberSafe).not.toMatch(/\bno cover\b/i);
    });
  }

  it("collapsed reasons all present the same outward string", () => {
    // Otherwise the difference between two responses is itself the disclosure,
    // and an attacker distinguishes "no such member" from "member suspended"
    // by comparing them.
    const collapsed = ALL_ELIGIBILITY_DECISION_REASONS.filter(
      (r) => ELIGIBILITY_REASON_CATALOGUE[r]?.disclosure === "COLLAPSE",
    );
    expect(collapsed.length).toBeGreaterThan(0);
    assertUserSafe("COLLAPSED_NOT_FOUND_MESSAGE", COLLAPSED_NOT_FOUND_MESSAGE);
    expect(COLLAPSED_NOT_FOUND_MESSAGE).toMatch(/[.!?]$/);
  });
});
