/**
 * UAT-HF P02.02 — the contract surfaces must never render a stored date with an
 * unguarded `toISOString()` again.
 *
 * DEF-050 (S1) was one line: `{c.startDate.toISOString().slice(0, 10)}` inside
 * the register's `Array.map`. One unrenderable row therefore stopped the WHOLE
 * list rendering for every user, on every load, and `/contracts/{id}/edit`
 * returned Page Not Found so no UI route could reach the row to fix it.
 *
 * The call sites are fixed. This is the regression guard, because the fix is one
 * easy line to reintroduce — and the run proved the cost of getting it wrong is a
 * dead module rather than a cosmetic bug.
 *
 * It also asserts the behavioural contract of the helpers those sites now use,
 * against the ACTUAL values from the run's row.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  INVALID_DATE_LABEL,
  calendarInputValue,
  formatStoredDate,
  isRenderableStoredDate,
} from "@/lib/calendar-date";

/** Every surface that renders a provider-contract term date. */
const CONTRACT_SURFACES = [
  "src/app/(admin)/contracts/page.tsx",
  "src/app/(admin)/contracts/[id]/page.tsx",
  "src/app/(admin)/contracts/analytics/page.tsx",
  "src/app/(admin)/providers/[id]/page.tsx",
  "src/app/provider/contracts/page.tsx",
  "src/app/provider/contracts/[id]/page.tsx",
];

/** `x.startDate.toISOString()`, `c.endDate?.toISOString()`, etc. */
const UNGUARDED = /\b\w+\.(startDate|endDate|reviewDueDate|effectiveFrom|effectiveTo)\??\.toISOString\s*\(/;

describe("P02.02 no unguarded contract-date rendering", () => {
  it.each(CONTRACT_SURFACES)("%s renders stored dates through the safe helpers", (file) => {
    const lines = readFileSync(file, "utf8").split("\n");
    const offenders = lines
      .map((line, i) => ({ line: line.trim(), number: i + 1 }))
      .filter(({ line }) => !line.startsWith("//") && !line.startsWith("*"))
      .filter(({ line }) => UNGUARDED.test(line));

    expect(
      offenders,
      `Use formatStoredDate()/calendarInputValue() from @/lib/calendar-date. ` +
        `An unguarded toISOString() on a stored contract date is DEF-050 — it took the whole ` +
        `Provider Contracts module down for every user.`,
    ).toEqual([]);
  });
});

describe("P02.02 the helpers those surfaces rely on", () => {
  /** The values the run's row actually carried. */
  const DEF_050_START = new Date(Date.UTC(60901, 1, 20));
  const DEF_050_END = new Date(Date.UTC(70831, 1, 20));

  it("labels an out-of-range stored date instead of throwing", () => {
    expect(() => formatStoredDate(DEF_050_START)).not.toThrow();
    expect(formatStoredDate(DEF_050_START)).toBe(INVALID_DATE_LABEL);
    expect(formatStoredDate(DEF_050_END)).toBe(INVALID_DATE_LABEL);
  });

  it("labels an Invalid Date instead of throwing", () => {
    // This is what the driver hands back for a timestamp it cannot parse — and
    // `.toISOString()` on it is a RangeError.
    const invalid = new Date("not-a-date");
    expect(() => invalid.toISOString()).toThrow(RangeError);
    expect(formatStoredDate(invalid)).toBe(INVALID_DATE_LABEL);
  });

  it("still renders a good date normally, so the register keeps working", () => {
    expect(formatStoredDate(new Date("2026-08-11T00:00:00.000Z"))).toBe("11 Aug 2026");
    expect(formatStoredDate(null)).toBe("—");
  });

  it("leaves a repair form's date input EMPTY rather than crashing it", () => {
    // The form that exists to fix the row must survive the row.
    expect(calendarInputValue(DEF_050_START)).toBe("");
    expect(calendarInputValue(new Date("not-a-date"))).toBe("");
    expect(calendarInputValue(new Date("2026-08-11T00:00:00.000Z"))).toBe("2026-08-11");
    expect(calendarInputValue(null)).toBe("");
  });

  it("identifies which rows must be quarantined", () => {
    expect(isRenderableStoredDate(DEF_050_START)).toBe(false);
    expect(isRenderableStoredDate(new Date("not-a-date"))).toBe(false);
    expect(isRenderableStoredDate(new Date("2026-08-11T00:00:00.000Z"))).toBe(true);
    // An absent optional date is not damage — the run DISPROVED the theory that
    // a null reviewDueDate caused DEF-050.
    expect(isRenderableStoredDate(null)).toBe(true);
  });

  it("a mixed register renders every good row and quarantines only the bad one", () => {
    const rows = [
      { id: "a", startDate: new Date("2026-01-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z") },
      { id: "bad", startDate: DEF_050_START, endDate: DEF_050_END },
      { id: "b", startDate: new Date("2027-01-01T00:00:00.000Z"), endDate: new Date("2027-12-31T00:00:00.000Z") },
    ];

    // The shape of the register's map. Before P02.02 the middle row threw here
    // and rows "a" and "b" never rendered either.
    const rendered = rows.map((r) =>
      isRenderableStoredDate(r.startDate) && isRenderableStoredDate(r.endDate)
        ? `${formatStoredDate(r.startDate)} → ${formatStoredDate(r.endDate)}`
        : INVALID_DATE_LABEL,
    );

    expect(rendered[0]).toBe("1 Jan 2026 → 31 Dec 2026");
    expect(rendered[1]).toBe(INVALID_DATE_LABEL);
    expect(rendered[2]).toBe("1 Jan 2027 → 31 Dec 2027");
  });
});
