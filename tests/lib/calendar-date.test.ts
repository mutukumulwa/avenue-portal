/**
 * UAT-HF P01.05 — calendar days must not drift, and must not be ambiguous.
 *
 * The findings behind each group:
 *   DEF-017  the same endorsement rendered "7/1/2026" in HR and "01/07/2026" in
 *            admin — six months apart on ONE value
 *   DEF-020  no format hint, no timezone; "01/02" read by browser locale
 *   DEF-032  newborn cover start unconfirmable at month granularity
 *   DEF-050  an unguarded toISOString() on a bad value threw RangeError and took
 *            out the whole Provider Contracts module
 *   DEC-12   the entered date is the LAST COVERED DAY; ineligibility starts the
 *            following local calendar day
 */
import { describe, it, expect } from "vitest";
import {
  CALENDAR_DATE_INPUT_HINT,
  addCalendarDays,
  calendarDateFromInstant,
  calendarDateFromUtcDate,
  calendarDateReadback,
  calendarDateToUtcDate,
  compareCalendarDates,
  differenceInCalendarDays,
  formatCalendarDate,
  formatInstant,
  ineligibleFromLastCoveredDay,
  isCalendarDate,
  isCoveredOn,
  parseCalendarDate,
  todayCalendarDate,
} from "@/lib/calendar-date";

describe("P01.05 parsing a calendar day", () => {
  it("accepts a well-formed day", () => {
    expect(parseCalendarDate("2026-08-11")).toBe("2026-08-11");
    expect(parseCalendarDate("  2026-08-11  ")).toBe("2026-08-11");
    expect(isCalendarDate("2026-08-11")).toBe(true);
  });

  it("accepts a real leap day and rejects a fake one", () => {
    expect(parseCalendarDate("2024-02-29")).toBe("2024-02-29");
    // 2026 is not a leap year — `new Date()` would roll this into 1 March.
    expect(parseCalendarDate("2026-02-29")).toBeNull();
  });

  it("rejects impossible days instead of rolling them forward", () => {
    // These are the values `new Date("2026-02-30")` silently turns into March.
    expect(parseCalendarDate("2026-02-30")).toBeNull();
    expect(parseCalendarDate("2026-04-31")).toBeNull();
    expect(parseCalendarDate("2026-13-01")).toBeNull();
    expect(parseCalendarDate("2026-00-10")).toBeNull();
    expect(parseCalendarDate("2026-08-00")).toBeNull();
  });

  it("rejects five- and six-digit years — the DEF-050 shape", () => {
    expect(parseCalendarDate("12026-08-11")).toBeNull();
    expect(parseCalendarDate("202600-08-11")).toBeNull();
    expect(parseCalendarDate("226-08-11")).toBeNull();
  });

  it("rejects anything carrying a time — that is an instant, not a calendar day", () => {
    expect(parseCalendarDate("2026-08-11T00:00:00Z")).toBeNull();
    expect(parseCalendarDate("2026-08-11 09:30")).toBeNull();
  });

  it("rejects ambiguous and non-ISO input outright", () => {
    // DEF-020: "01/02" is either 1 Feb or 2 Jan depending on the browser. We
    // never guess.
    expect(parseCalendarDate("01/02/2026")).toBeNull();
    expect(parseCalendarDate("11 Aug 2026")).toBeNull();
    expect(parseCalendarDate("not-a-date")).toBeNull();
    expect(parseCalendarDate("")).toBeNull();
    expect(parseCalendarDate(null)).toBeNull();
    expect(parseCalendarDate(undefined)).toBeNull();
  });

  it("enforces the DEC-02 technical range", () => {
    expect(parseCalendarDate("1900-01-01")).toBe("1900-01-01");
    expect(parseCalendarDate("9999-12-31")).toBe("9999-12-31");
    expect(parseCalendarDate("1899-12-31")).toBeNull();
  });
});

describe("P01.05 timezone boundaries", () => {
  it("resolves an instant to the Africa/Nairobi day, not the UTC day", () => {
    // 22:30 UTC on 11 Aug is already 01:30 on 12 Aug in EAT (UTC+3). Using
    // toISOString().slice(0,10) here would answer "2026-08-11" — wrong for three
    // hours of every Ugandan day.
    const lateUtc = new Date("2026-08-11T22:30:00.000Z");
    expect(calendarDateFromInstant(lateUtc)).toBe("2026-08-12");
    expect(calendarDateFromInstant(lateUtc, "UTC")).toBe("2026-08-11");
  });

  it("resolves an early-morning UTC instant to the same EAT day", () => {
    const earlyUtc = new Date("2026-08-11T00:30:00.000Z"); // 03:30 EAT, same day
    expect(calendarDateFromInstant(earlyUtc)).toBe("2026-08-11");
  });

  it("round-trips a calendar day through storage without shifting", () => {
    const day = "2026-08-11";
    const stored = calendarDateToUtcDate(day)!;
    expect(stored.toISOString()).toBe("2026-08-11T00:00:00.000Z");
    expect(calendarDateFromUtcDate(stored)).toBe(day);
  });

  it("round-trips every day of a month, including month ends", () => {
    for (const day of ["2026-01-01", "2026-02-28", "2024-02-29", "2026-06-30", "2026-12-31"]) {
      expect(calendarDateFromUtcDate(calendarDateToUtcDate(day)!)).toBe(day);
    }
  });

  it("returns null rather than an Invalid Date for bad input", () => {
    expect(calendarDateToUtcDate("2026-02-30")).toBeNull();
    expect(calendarDateFromUtcDate(new Date("nope"))).toBeNull();
    expect(calendarDateFromInstant(new Date("nope"))).toBeNull();
  });

  it("today is resolved in the operational zone", () => {
    expect(todayCalendarDate(new Date("2026-08-11T22:30:00.000Z"))).toBe("2026-08-12");
  });
});

describe("P01.05 calendar arithmetic", () => {
  it("adds and subtracts whole days across month and year ends", () => {
    expect(addCalendarDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addCalendarDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29"); // leap year
    expect(addCalendarDays("2026-02-28", 1)).toBe("2026-03-01"); // not a leap year
  });

  it("orders and differences days correctly", () => {
    expect(compareCalendarDates("2026-08-11", "2026-08-12")).toBe(-1);
    expect(compareCalendarDates("2026-08-12", "2026-08-11")).toBe(1);
    expect(compareCalendarDates("2026-08-11", "2026-08-11")).toBe(0);
    expect(differenceInCalendarDays("2026-08-11", "2026-08-21")).toBe(10);
    expect(differenceInCalendarDays("2026-08-21", "2026-08-11")).toBe(-10);
  });

  it("refuses fractional day shifts", () => {
    expect(addCalendarDays("2026-08-11", 1.5)).toBeNull();
  });
});

describe("P01.05 DEC-12 last-covered-day semantics", () => {
  it("ineligibility begins the day AFTER the last covered day", () => {
    // The example written into DECISIONS.md.
    expect(ineligibleFromLastCoveredDay("2026-08-31")).toBe("2026-09-01");
  });

  it("the member is still covered ON the last covered day", () => {
    expect(isCoveredOn("2026-08-31", "2026-08-31")).toBe(true);
    expect(isCoveredOn("2026-09-01", "2026-08-31")).toBe(false);
    expect(isCoveredOn("2026-08-30", "2026-08-31")).toBe(true);
  });

  it("treats an absent last-covered day as open-ended cover", () => {
    expect(isCoveredOn("2030-01-01", null)).toBe(true);
  });

  it("is not covered on an invalid service date", () => {
    expect(isCoveredOn("2026-02-30", "2026-12-31")).toBe(false);
  });
});

describe("P01.05 display", () => {
  it("renders one unambiguous format — the DEF-017 fix", () => {
    // "7/1/2026" vs "01/07/2026" cannot happen with a named month.
    expect(formatCalendarDate("2026-07-01")).toBe("1 Jul 2026");
    expect(formatCalendarDate("2026-01-07")).toBe("7 Jan 2026");
  });

  it("NEVER throws on a bad stored value — it says so", () => {
    // DEF-050: an unguarded toISOString() here took down a whole module.
    expect(formatCalendarDate("12026-08-11")).toBe("Invalid date — repair required");
    expect(formatCalendarDate(null)).toBe("Invalid date — repair required");
    expect(formatCalendarDate(undefined)).toBe("Invalid date — repair required");
    expect(formatInstant(new Date("nope"))).toBe("Invalid date — repair required");
  });

  it("shows the timezone when an instant matters (DEF-020)", () => {
    const rendered = formatInstant(new Date("2026-08-11T09:05:00.000Z"));
    expect(rendered).toContain("EAT");
    expect(rendered).toContain("12:05"); // 09:05 UTC is 12:05 in Africa/Nairobi
    expect(formatInstant(new Date("2026-08-11T09:05:00.000Z"), { showZone: false })).not.toContain("EAT");
  });

  it("offers a format hint and a readback so a typed date can be confirmed", () => {
    expect(CALENDAR_DATE_INPUT_HINT).toBe("DD/MM/YYYY");
    // DEF-032: a newborn's cover start must be confirmable to the exact day.
    expect(calendarDateReadback("2026-08-11", "Cover starts")).toBe("Cover starts: 11 Aug 2026");
    expect(calendarDateReadback(null, "Cover starts")).toBe("Cover starts: not set");
  });
});
