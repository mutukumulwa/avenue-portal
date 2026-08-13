import { describe, it, expect } from "vitest";
import { waitingPeriodStatus } from "@/lib/member-policy-copy";
import { ELIGIBILITY_REASON_CATALOGUE } from "@/server/services/eligibility/decision-contract";
import { readFileSync } from "node:fs";

/**
 * UAT-HF P03.06 — the provider desk evaluates the waiting period.
 *
 * The parity gate's finding: `provider-eligibility.service.ts` performed **no
 * waiting-period evaluation at all**. A provider asked "is this member covered
 * for maternity?" was told cover was active, treated the patient, and the claim
 * was declined afterwards — the cost landing on whoever was least able to
 * predict it.
 *
 * The gate's own provider column reuses the member column, because both call
 * the same function; that proves the module is shared, not that the service
 * calls it. These assert the service's wiring.
 */
const service = readFileSync("src/server/services/provider-eligibility.service.ts", "utf8");

describe("the provider verdict consults the shared read model", () => {
  it("calls waitingPeriodStatus, not a second implementation", () => {
    // A second copy is how the audiences diverged in the first place.
    expect(service).toContain("waitingPeriodStatus({");
    expect(service).toContain('from "@/lib/member-policy-copy"');
  });

  it("reads the wait from the member's PINNED version", () => {
    // F-PIN-1: a benefit config on a newer version may not apply to them.
    expect(service).toContain("m.packageVersion?.benefits.find");
  });

  it("passes every anchor, so a non-default basis resolves", () => {
    expect(service).toContain("dependantJoinDate: m.coverStartDate");
    expect(service).toContain("m.principal?.coverStartDate");
    expect(service).toContain('cp.reason === "REINSTATEMENT"');
  });

  it("evaluates as of the SERVICE date, not today", () => {
    // A provider checking cover for a visit next week must get next week's
    // answer; `now: new Date()` would answer for today.
    expect(service).toMatch(/now: serviceDate/);
  });

  it("only asks when a benefit category was named", () => {
    // "Is this member covered?" is not a question about one benefit. Answering
    // WAITING_PERIOD to it would refuse a member whose cover is fine.
    expect(service).toContain('decision.conclusion === "ELIGIBLE" && benefitCategory');
  });

  it("does NOT block on an unresolved wait", () => {
    // A wait whose basis date is unknown is our configuration gap. Refusing
    // care on it turns our missing data into a refused patient.
    expect(service).toContain("if (wait.waiting) {");
    expect(service).not.toContain("wait.unresolved &&");
  });

  it("reports a blocked benefit without claiming the member lost cover", () => {
    const entry = ELIGIBILITY_REASON_CATALOGUE.WAITING_PERIOD;
    expect(entry.memberStillCovered).toBe(true);
    expect(entry.memberSafe).toMatch(/waiting period/i);
    expect(entry.operatorGuidance).toMatch(/do not treat as covered/i);
  });

  it("tells the desk the date, not just the refusal", () => {
    expect(service).toContain("Eligible from ${wait.eligibleFrom}");
  });
});

describe("the answer itself matches the member app", () => {
  it("a 270-day maternity wait blocks on the service date and states when it lifts", () => {
    const wait = waitingPeriodStatus({
      waitingPeriodDays: 270,
      waitingPeriodBasis: "COVER_START",
      coverStartDate: "2026-08-11T00:00:00Z",
      now: new Date("2026-08-13T00:00:00Z"),
    });
    expect(wait.waiting).toBe(true);
    expect(wait.eligibleFrom).toBe("2027-05-08");
  });

  it("and does not block once elapsed", () => {
    const wait = waitingPeriodStatus({
      waitingPeriodDays: 270,
      waitingPeriodBasis: "COVER_START",
      coverStartDate: "2026-08-11T00:00:00Z",
      now: new Date("2027-05-08T00:00:00Z"),
    });
    expect(wait.waiting).toBe(false);
  });
});
