/**
 * UAT-HF S3 batch — DEF-022, DEF-026, DEF-028, DEF-044.
 *
 * These four were the only S3s in the register with no work behind them. Three
 * needed code; one turned out to have been fixed already under a different task
 * and is pinned here so it cannot silently regress.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  WAITING_PERIOD_BASIS,
  waitingPeriodAuthoringLabel,
  waitingPeriodStatus,
  waitingPeriodWorkedExample,
} from "@/lib/member-policy-copy";
import { blockingMatch, candidateWarnings, type IdentityMatch } from "@/server/services/identity-match.service";

const read = (p: string) => readFileSync(p, "utf8");

// ─── DEF-022 — the waiting period finally names its basis and its date ───────

describe("DEF-022 the maker can answer 'when does cover begin?'", () => {
  it("states the number of days AND what they run from", () => {
    // The whole maker-facing disclosure was the fragment "270d wait".
    expect(waitingPeriodAuthoringLabel(270)).toBe("270 days from the member's cover start date");
  });

  it("says nothing when there is no wait", () => {
    // "0 days from cover start" reads like a rule where there is none.
    expect(waitingPeriodAuthoringLabel(0)).toBeNull();
    expect(waitingPeriodAuthoringLabel(null)).toBeNull();
    expect(waitingPeriodAuthoringLabel(undefined)).toBeNull();
  });

  it("works the eligible date out, rather than leaving it to be done by hand", () => {
    const worked = waitingPeriodWorkedExample(270, new Date("2026-08-11T00:00:00Z"));
    expect(worked).not.toBeNull();
    expect(worked!.eligibleFrom).toBe("2027-05-08");
    expect(worked!.label).toMatch(/covered for this from 8 May 2027/);
  });

  it("names the start it worked from, so the arithmetic is checkable", () => {
    const worked = waitingPeriodWorkedExample(30, new Date("2026-08-11T00:00:00Z"));
    // formatCalendarDate uses short month names ("11 Aug 2026") throughout.
    expect(worked!.label).toMatch(/cover starts 11 Aug 2026/);
  });

  it("agrees exactly with the member-facing calculation", () => {
    // One basis, two audiences. If these ever diverge, a maker tells an employer
    // one date and the member's app shows another.
    const start = new Date("2026-08-11");
    const maker = waitingPeriodWorkedExample(270, start);
    const member = waitingPeriodStatus({
      waitingPeriodDays: 270,
      coverStartDate: start,
      now: new Date("2026-09-01T00:00:00Z"),
    });
    expect(maker!.eligibleFrom).toBe(member.eligibleFrom);
  });

  it("the package detail page shows both", () => {
    const page = read("src/app/(admin)/packages/[id]/page.tsx");
    expect(page).toContain("waitingPeriodAuthoringLabel");
    expect(page).toContain("waitingPeriodWorkedExample");
    expect(page).toMatch(/Waiting periods run from/);
    // And the bare fragment the run quoted is gone.
    expect(page).not.toMatch(/\{b\.waitingPeriodDays\}d wait/);
  });

  it("the basis is stated once and shared", () => {
    expect(WAITING_PERIOD_BASIS).toBe("the member's cover start date");
  });
});

// ─── DEF-026 — a shared household phone is not a duplicate ───────────────────

describe("DEF-026 phone is not an identity key", () => {
  const phoneMatch: IdentityMatch = { signal: "PHONE", strength: "CANDIDATE", matchedMemberId: "m2" };
  const idMatch: IdentityMatch = { signal: "NATIONAL_ID", strength: "HARD", matchedMemberId: "m3" };

  it("a duplicate phone does NOT block enrolment", () => {
    // "A Ugandan household routinely shares one mobile number between a
    // principal and dependants" — DEC-07. The run could only create its
    // controlled member by omitting the phone entirely.
    expect(blockingMatch([phoneMatch])).toBeNull();
  });

  it("a duplicate national ID still does", () => {
    expect(blockingMatch([idMatch])?.signal).toBe("NATIONAL_ID");
  });

  it("the duplicate phone surfaces as a warning instead", () => {
    const warnings = candidateWarnings([phoneMatch]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/households often share a number/i);
    expect(warnings[0]).toMatch(/not a block/i);
  });

  it("no warning names the other member", () => {
    // DEF-078: the message used to read 'already exists: Margaret Bukenya
    // (NWSC-2026-00362)', turning enrolment into an identifier lookup.
    expect(JSON.stringify(candidateWarnings([phoneMatch, idMatch]))).not.toContain("m2");
  });
});

// ─── DEF-028 — both enrolment paths apply the same rules ────────────────────

describe("DEF-028 the HR path enforces what the admin path enforces", () => {
  const hr = read("src/app/(hr)/hr/roster/new/actions.ts");

  it("runs the SAME identity probe, not a second implementation", () => {
    // "The two enrolment paths therefore enforce different identity rules."
    expect(hr).toContain("findIdentityMatches");
    expect(hr).toContain("@/server/services/identity-match.service");
  });

  it("blocks a hard conflict at submission instead of queueing it", () => {
    // The run's request was accepted and queued: "successfully submitted to
    // Medvex for processing" — the clash was the TPA's problem days later.
    expect(hr).toContain("blockingMatch(identityMatches)");
    expect(hr).toContain("blockingMessage(blocking)");
  });

  it("passes candidate warnings back rather than swallowing them", () => {
    expect(hr).toContain("candidateWarnings(identityMatches)");
    const form = read("src/app/(hr)/hr/roster/new/HRAddMemberForm.tsx");
    expect(form).toContain("state.warnings");
    expect(form).toMatch(/None of these stops the request/);
  });

  it("normalises through the shared module, so 07 and \\+256 are one identity", () => {
    // A second normalisation here would let the two paths disagree again by a
    // different route.
    expect(hr).not.toMatch(/ugandaPhoneVariants|normalizeNationalId/);
  });
});

// ─── DEF-044 — the renewal workflow is reachable ────────────────────────────

describe("DEF-044 renewal is routed, not rebuilt", () => {
  it("the scheme's Renewal Date is no longer inert", () => {
    // "The scheme record displays 'Renewal Date 11/08/2027' as read-only data;
    // its only actions are Edit, Suspend, Mark Lapsed, Terminate, Add Tier and
    // Convert to Self-Funded."
    const group = read("src/app/(admin)/groups/[id]/page.tsx");
    expect(group).toMatch(/Prepare renewal/);
    expect(group).toContain("/analytics/renewals/");
  });

  it("the navigation finally has a renewal item", () => {
    // "The full navigation contains no renewal item, and the three plausible
    // candidates are scoped elsewhere."
    const nav = read("src/components/layouts/AdminSidebar.tsx");
    expect(nav).toMatch(/label: "Renewals"/);
    expect(nav).toContain("/analytics/renewals");
  });

  it("is gated to the persona that could not reach it", () => {
    // The defect is specifically that no renewal control exists "on any surface
    // reachable by the Underwriter persona".
    const nav = read("src/components/layouts/AdminSidebar.tsx");
    const line = nav.split("\n").find((l) => l.includes('label: "Renewals"'))!;
    expect(line).toContain("UNDERWRITING");
  });

  it("points at the existing workflow rather than a new one", () => {
    // The register's own conclusion: "The gap is routing and coverage, not
    // capability." Both the preview and the bind were already built.
    const page = read("src/app/(admin)/analytics/renewals/[groupId]/page.tsx");
    expect(page).toContain("previewRenewal");
    expect(page).toContain("bindRenewalAction");
  });
});
