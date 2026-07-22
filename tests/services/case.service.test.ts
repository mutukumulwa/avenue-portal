/**
 * CaseService — unit tests for the logic the service still OWNS after F5.8/F5.9
 * moved claim persistence onto the canonical intake (`submitWithinTransaction`).
 *
 * The former claim-path unit tests here (final/interim claim shape, SET-02/03
 * freezes, FG-C9 concurrent close, PA re-point, invoice sequence, TIME-05
 * cut-off inclusivity, bed-day flags) are now proven against a REAL database in
 * tests/integration/claim-intake-case.integration.test.ts — strictly stronger
 * than the old mocked-prisma assertions.
 */
import { describe, it, expect } from "vitest";
import { CaseService } from "@/server/services/case.service";

const entry = (date: string, description: string, amount = 100_000) => ({
  entryDate: new Date(date),
  description,
  totalAmount: amount,
});

describe("CaseService.detectBedDayOverlaps (IP-DEF-04)", () => {
  it("flags multiple bed-day-like charges on the SAME calendar day", () => {
    const overlaps = CaseService.detectBedDayOverlaps([
      entry("2026-06-02", "Bed day — general ward"),
      entry("2026-06-02", "Bed day — private room"),
      entry("2026-06-03", "Pharmacy"),
    ] as never);
    expect(overlaps.length).toBe(1);
    expect(overlaps[0].day).toBe("2026-06-02");
    expect(overlaps[0].items.length).toBe(2);
  });

  it("does NOT flag bed days on distinct days or non-bed charges", () => {
    const overlaps = CaseService.detectBedDayOverlaps([
      entry("2026-06-02", "Bed day"),
      entry("2026-06-03", "Bed day"),
      entry("2026-06-03", "Theatre fees"),
    ] as never);
    expect(overlaps).toEqual([]);
  });
});
