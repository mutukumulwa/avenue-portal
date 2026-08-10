/**
 * WP-3.5D — enrolment age gate. Reuses the ONE calendar-correct age helper
 * (`computeAge`) so enrolment enforcement matches the SP-6 evaluator exactly:
 * exactly-max is ELIGIBLE, one year over is REJECTED (M-008/009/010, EO-015/016),
 * SPOUSE/PARENT carry no child cap, and future / impossible DOB is rejected.
 */
import { describe, it, expect } from "vitest";
import { checkEnrolmentAge, assertEnrolmentAge } from "@/server/services/eligibility/enrolment-age";

const asOf = new Date("2026-08-01");
const rules = { maxAge: 65, dependentMaxAge: 24 };

describe("checkEnrolmentAge — principal max age", () => {
  it("accepts a principal exactly at the max age (M-008/009 exactly-max eligible)", () => {
    // Born 1961-08-01 → exactly 65 on 2026-08-01.
    const r = checkEnrolmentAge({ relationship: "PRINCIPAL", dateOfBirth: new Date("1961-08-01") }, asOf, rules);
    expect(r.ok).toBe(true);
    expect(r.age).toBe(65);
  });

  it("rejects a principal over the max age (M-010 one-over rejected)", () => {
    // Born 1960-08-01 → 66 on 2026-08-01.
    const r = checkEnrolmentAge({ relationship: "PRINCIPAL", dateOfBirth: new Date("1960-08-01") }, asOf, rules);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/maximum age of 65/i);
  });
});

describe("checkEnrolmentAge — dependant (CHILD) max age", () => {
  it("accepts a CHILD exactly at the dependant max age (EO-015)", () => {
    const r = checkEnrolmentAge({ relationship: "CHILD", dateOfBirth: new Date("2002-08-01") }, asOf, rules);
    expect(r.ok).toBe(true);
    expect(r.age).toBe(24);
  });

  it("still eligible one DAY inside the cap year (completed-years semantics)", () => {
    // Born 2002-07-31 → 24 (turned 24 yesterday), not yet 25 → eligible.
    const r = checkEnrolmentAge({ relationship: "CHILD", dateOfBirth: new Date("2002-07-31") }, asOf, rules);
    expect(r.ok).toBe(true);
    expect(r.age).toBe(24);
  });

  it("rejects a CHILD over the dependant max age", () => {
    const r = checkEnrolmentAge({ relationship: "CHILD", dateOfBirth: new Date("2001-08-01") }, asOf, rules);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/maximum dependant age of 24/i);
  });
});

describe("checkEnrolmentAge — spouse / parent are not child-capped", () => {
  it("accepts a 40-year-old SPOUSE (no child cap — the EO-017 guard)", () => {
    const r = checkEnrolmentAge({ relationship: "SPOUSE", dateOfBirth: new Date("1986-01-01") }, asOf, rules);
    expect(r.ok).toBe(true);
  });

  it("accepts an elderly PARENT dependant (no child cap)", () => {
    const r = checkEnrolmentAge({ relationship: "PARENT", dateOfBirth: new Date("1950-01-01") }, asOf, rules);
    expect(r.ok).toBe(true);
  });
});

describe("checkEnrolmentAge — invalid / impossible dates", () => {
  it("rejects a future date of birth", () => {
    const r = checkEnrolmentAge({ relationship: "PRINCIPAL", dateOfBirth: new Date("2027-01-01") }, asOf, rules);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/future/i);
  });

  it("rejects an impossible age (> 120y)", () => {
    const r = checkEnrolmentAge({ relationship: "PRINCIPAL", dateOfBirth: new Date("1850-01-01") }, asOf, rules);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/impossible age/i);
  });

  it("rejects a missing / unparseable date of birth", () => {
    expect(checkEnrolmentAge({ relationship: "PRINCIPAL", dateOfBirth: null }, asOf, rules).ok).toBe(false);
    expect(checkEnrolmentAge({ relationship: "PRINCIPAL", dateOfBirth: "not-a-date" }, asOf, rules).ok).toBe(false);
  });
});

describe("assertEnrolmentAge — throwing wrapper", () => {
  it("throws a named, member-safe error on rejection", () => {
    expect(() =>
      assertEnrolmentAge(
        { relationship: "CHILD", dateOfBirth: new Date("2000-01-01"), firstName: "Old", lastName: "Child" },
        asOf,
        rules,
      ),
    ).toThrow(/Old Child: .*maximum dependant age/i);
  });

  it("does not throw for an in-bounds member", () => {
    expect(() =>
      assertEnrolmentAge({ relationship: "PRINCIPAL", dateOfBirth: new Date("1990-01-01") }, asOf, rules),
    ).not.toThrow();
  });

  it("no cap configured → never blocks on a plausible age", () => {
    expect(() =>
      assertEnrolmentAge({ relationship: "PRINCIPAL", dateOfBirth: new Date("1948-06-01") }, asOf, { maxAge: null, dependentMaxAge: null }),
    ).not.toThrow(); // 78y old, no cap → allowed
  });
});
