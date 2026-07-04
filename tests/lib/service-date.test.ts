/**
 * PR-013 acceptance: future-DOS boundary in the tenant operating timezone
 * (Africa/Kampala, UTC+3, no DST).
 */
import { describe, it, expect } from "vitest";
import {
  isFutureServiceDate,
  assertServiceDateNotFuture,
  operatingTodayISO,
  FUTURE_SERVICE_DATE_ERROR,
} from "@/lib/service-date";

describe("service-date rules (PR-013)", () => {
  it("rejects tomorrow", () => {
    const now = new Date("2026-07-04T10:00:00Z");
    expect(isFutureServiceDate(new Date("2026-07-05T00:00:00Z"), now)).toBe(true);
    expect(() => assertServiceDateNotFuture(new Date("2026-07-05T00:00:00Z"), now)).toThrow(
      FUTURE_SERVICE_DATE_ERROR,
    );
  });

  it("accepts today and the past", () => {
    const now = new Date("2026-07-04T10:00:00Z");
    expect(isFutureServiceDate(new Date("2026-07-04T00:00:00Z"), now)).toBe(false);
    expect(isFutureServiceDate(new Date("2026-06-01T00:00:00Z"), now)).toBe(false);
    expect(() => assertServiceDateNotFuture(new Date("2026-07-04T09:00:00Z"), now)).not.toThrow();
  });

  it("23:30 Kampala on date D is still D even after UTC midnight rolls to D+1", () => {
    // 2026-07-04 23:30 Kampala == 2026-07-04 20:30 UTC. A DOS stamped
    // 2026-07-04 (midnight UTC) must be accepted at that moment.
    const nowKampalaLateEvening = new Date("2026-07-04T20:30:00Z");
    expect(isFutureServiceDate(new Date("2026-07-04T00:00:00Z"), nowKampalaLateEvening)).toBe(false);

    // Conversely: at 2026-07-04 22:30 UTC it is already 2026-07-05 01:30 in
    // Kampala, so a DOS of 2026-07-05 is "today", not future.
    const nowUtcBeforeMidnight = new Date("2026-07-04T22:30:00Z");
    expect(isFutureServiceDate(new Date("2026-07-05T00:00:00Z"), nowUtcBeforeMidnight)).toBe(false);
  });

  it("year and month boundaries compare correctly", () => {
    const now = new Date("2026-12-31T10:00:00Z");
    expect(isFutureServiceDate(new Date("2027-01-01T00:00:00Z"), now)).toBe(true);
    expect(isFutureServiceDate(new Date("2026-12-31T00:00:00Z"), now)).toBe(false);
  });

  it("operatingTodayISO renders the Kampala calendar date", () => {
    // 22:30 UTC on the 4th is already the 5th in Kampala.
    expect(operatingTodayISO(new Date("2026-07-04T22:30:00Z"))).toBe("2026-07-05");
    expect(operatingTodayISO(new Date("2026-07-04T10:00:00Z"))).toBe("2026-07-04");
  });
});
