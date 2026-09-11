/**
 * DEC-FH-X11 (owner, 2026-09-11): withdrawn and superseded claims stay in every
 * log but count in no total. This pins the one rule every surface shares.
 */
import { describe, it, expect } from "vitest";
import { ClaimStatus } from "@prisma/client";
import { CLAIM_STATUSES_OUT_OF_TOTALS, COUNTED_IN_TOTALS, countsInTotals } from "@/lib/claim-totals";
import { matches } from "../fixtures/claim-totals-db";

describe("DEC-FH-X11 — which claims count in totals", () => {
  it("leaves out exactly WITHDRAWN and SUPERSEDED", () => {
    expect([...CLAIM_STATUSES_OUT_OF_TOTALS].sort()).toEqual(["SUPERSEDED", "WITHDRAWN"]);
  });

  it("counts every other status — declined and void were decided, so they still count", () => {
    const all = Object.values(ClaimStatus);
    expect(all.filter((status) => !countsInTotals({ status })).sort()).toEqual(["SUPERSEDED", "WITHDRAWN"]);
    expect(countsInTotals({ status: "DECLINED" })).toBe(true);
    expect(countsInTotals({ status: "VOID" })).toBe(true);
    expect(countsInTotals({ status: "RECEIVED" })).toBe(true);
  });

  it("gives Prisma the same rule as the in-code check", () => {
    expect(COUNTED_IN_TOTALS).toEqual({ status: { notIn: ["WITHDRAWN", "SUPERSEDED"] } });
    for (const status of Object.values(ClaimStatus)) {
      expect(matches({ status }, COUNTED_IN_TOTALS), status).toBe(countsInTotals({ status }));
    }
  });
});
