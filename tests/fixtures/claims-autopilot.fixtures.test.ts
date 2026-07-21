/**
 * Claims Autopilot F0.3 — golden-fixture self-consistency guard.
 *
 * Proves the oracle set is internally sound BEFORE any later layer relies on it:
 * money math holds (no floats, billed = qty × unit, total = line sum), structural
 * invariants hold (one primary diagnosis, ≥1 line, valid enum-ish route/queue),
 * names are unique, and duplicate scenarios carry a second submission.
 */
import { describe, it, expect } from "vitest";
import {
  GOLDEN_SCENARIOS,
  goldenByName,
  ROUTE,
  QUEUE,
  type GoldenScenario,
} from "./claims-autopilot";

const ROUTE_CODES = new Set<string>(Object.values(ROUTE));
const QUEUE_CODES = new Set<string>(Object.values(QUEUE));

/** Parse a decimal money string; must be finite, ≥ 0 and ≤ 2 decimal places. */
function money(s: string): number {
  expect(s, `money string "${s}"`).toMatch(/^\d+(\.\d{1,2})?$/);
  return Number(s);
}

describe("Claims Autopilot golden fixtures (F0.3)", () => {
  it("registers 19 uniquely-named scenarios and indexes them", () => {
    expect(GOLDEN_SCENARIOS.length).toBe(19);
    const names = GOLDEN_SCENARIOS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(Object.keys(goldenByName).sort()).toEqual([...names].sort());
  });

  describe.each(GOLDEN_SCENARIOS.map((s) => [s.name, s] as const))("%s", (_name, sc: GoldenScenario) => {
    it("has at least one line and each line's billed = qty × unitCost", () => {
      expect(sc.submission.lines.length).toBeGreaterThanOrEqual(1);
      for (const l of sc.submission.lines) {
        const qty = l.quantity;
        expect(Number.isInteger(qty) && qty >= 1, `${sc.name} qty`).toBe(true);
        const unit = money(l.unitCost);
        const billed = money(l.billedAmount);
        expect(Number((qty * unit).toFixed(2)), `${sc.name} line "${l.description}"`).toBe(billed);
      }
    });

    it("oracle.totalBilled equals the sum of line billed amounts", () => {
      const sum = sc.submission.lines.reduce((s, l) => s + Number(l.billedAmount), 0).toFixed(2);
      expect(sc.oracle.totalBilled).toBe(sum);
    });

    it("has exactly one primary diagnosis when diagnoses are present", () => {
      if (sc.submission.diagnoses.length > 0) {
        const primaries = sc.submission.diagnoses.filter((d) => d.isPrimary);
        expect(primaries.length, `${sc.name} primary diagnosis count`).toBe(1);
      }
    });

    it("uses only catalogued route codes / queues, consistent with money movement", () => {
      if (sc.oracle.routeCode !== null) {
        expect(ROUTE_CODES.has(sc.oracle.routeCode), `${sc.name} routeCode ${sc.oracle.routeCode}`).toBe(true);
      }
      if (sc.oracle.assignedQueue !== null) {
        expect(QUEUE_CODES.has(sc.oracle.assignedQueue), `${sc.name} queue ${sc.oracle.assignedQueue}`).toBe(true);
      }
      // A routed claim never moves money automatically.
      if (sc.oracle.routeCode !== null) {
        expect(sc.oracle.moneyMayMoveUnderLive, `${sc.name} routed ⇒ no money`).toBe(false);
      }
      // Money may move under LIVE only for a clean auto-approve.
      if (sc.oracle.moneyMayMoveUnderLive) {
        expect(sc.oracle.underLive).toBe("AUTO_APPROVE");
        expect(sc.oracle.routeCode).toBeNull();
      }
      // OFF always routes (D2).
      expect(sc.oracle.underOff).toBe("ROUTE");
      // SHADOW never moves money — it can only propose or route/replay/link.
      expect(["WOULD_APPROVE", "WOULD_PARTIAL", "ROUTE", "REPLAY", "CONFLICT", "STRONG_LINK"]).toContain(sc.oracle.underShadow);
    });

    it("duplicate/replay/conflict scenarios carry a second submission with the right key relationship", () => {
      const kind = sc.oracle.duplicateKind;
      if (!kind) {
        return;
      }
      expect(sc.secondSubmission, `${sc.name} needs secondSubmission`).toBeDefined();
      const a = sc.submission;
      const b = sc.secondSubmission!;
      if (kind === "EXACT_REPLAY" || kind === "KEY_CONFLICT") {
        expect(b.idempotencyKey, `${sc.name} shares key`).toBe(a.idempotencyKey);
      }
      if (kind === "STRONG_EVENT") {
        // Different transport keys, same authoritative invoice/external ref.
        expect(b.idempotencyKey).not.toBe(a.idempotencyKey);
        expect(b.invoiceNumber).toBe(a.invoiceNumber);
        expect(a.invoiceNumber).toBeTruthy();
      }
      if (kind === "FUZZY_SUSPECT") {
        // No authoritative identity shared; distinct keys and no shared invoice.
        expect(b.idempotencyKey).not.toBe(a.idempotencyKey);
        expect(a.invoiceNumber).toBeUndefined();
      }
    });

    it("references at least one acceptance-scenario id", () => {
      expect(sc.oracle.acceptanceScenarioIds.length).toBeGreaterThanOrEqual(1);
      for (const id of sc.oracle.acceptanceScenarioIds) {
        expect(id, `${sc.name} CA id`).toMatch(/^CA-\d{3}$/);
      }
    });
  });
});
