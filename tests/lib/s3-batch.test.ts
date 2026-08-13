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

// ─── DEF-023 — exclusions and referral rules on the package DETAIL page ─────

describe("DEF-023 a reviewer can read a package without editing it", () => {
  const detail = read("src/app/(admin)/packages/[id]/page.tsx");

  it("the detail page renders treatment exclusions", () => {
    // "a text search of the whole page finds neither ... The rules render
    // correctly and in full only inside /packages/<id>/edit — the surface whose
    // own banner reads 'Editing → new version'."
    expect(detail).toContain("treatmentExclusionRule.findMany");
    expect(detail).toMatch(/Treatment exclusions/);
  });

  it("and referral rules", () => {
    expect(detail).toContain("referralRule.findMany");
    expect(detail).toMatch(/Referral rules/);
  });

  it("shows the member-safe explanation, which is the point of the rule", () => {
    expect(detail).toMatch(/\{ex\.memberSafeExplanation\}/);
    expect(detail).toMatch(/\{r\.memberSafeExplanation\}/);
  });

  it("never FETCHES the internal source clause", () => {
    // The schema marks sourceClause "never member/provider-facing". Not
    // selecting it is a stronger guarantee than remembering not to render it —
    // the same rule P09.07 applied to the member surfaces.
    const block = detail.slice(detail.indexOf("treatmentExclusionRule.findMany"));
    expect(block.slice(0, 1200)).not.toMatch(/sourceClause:\s*true/);
    // Never rendered either. (A bare /sourceClause/ scan would match the comment
    // that explains why it is absent.)
    expect(detail).not.toMatch(/\{[^}]*\.sourceClause[^}]*\}/);
  });

  it("reads the CURRENT version, not a draft", () => {
    // This page shows what is in force. A draft's rules belong on the edit
    // screen, where the change-control panel explains their status.
    const block = detail.slice(detail.indexOf("treatmentExclusionRule.findMany"));
    expect(block.slice(0, 400)).toContain("pkg.currentVersion.id");
  });
});

// ─── DEF-005 — the employer portal speaks the employer's language ───────────

describe("DEF-005 insurer vocabulary is out of the HR portal", () => {
  const nav = read("src/components/layouts/HRSidebar.tsx");
  const list = read("src/app/(hr)/hr/endorsements/page.tsx");
  const newPage = read("src/app/(hr)/hr/roster/new/page.tsx");
  const form = read("src/app/(hr)/hr/roster/new/HRAddMemberForm.tsx");

  it("the navigation no longer says Endorsement", () => {
    // "The HR navigation item is 'Endorsement Requests'."
    expect(nav).not.toMatch(/label: "Endorsement Requests"/);
    expect(nav).toMatch(/label: "Membership Requests"/);
  });

  it("the list heading and its column say what HR filed, not what the insurer calls it", () => {
    expect(list).toMatch(/>Membership Requests</);
    expect(list).not.toMatch(/>Endorsement No\.</);
    expect(list).toMatch(/>Reference</);
  });

  it("the form subtitle describes the outcome, not the mechanism", () => {
    // "Submit an endorsement to enqueue a new member or dependent."
    expect(newPage).not.toMatch(/Submit an endorsement/);
    expect(newPage).toMatch(/Add an employee or a dependant/);
  });

  it("the confirmation drops the internal term", () => {
    expect(form).not.toMatch(/Your endorsement request/);
    expect(form).toMatch(/Your request <strong>/);
  });

  it("the two differently-labelled actions no longer lead to one form", () => {
    // "'Add Member' and '+ New Endorsement' both land on the identical form at
    // /hr/roster/new, so a user reasonably expecting a choice of request type
    // gets an addition form either way." P08.01 split them.
    expect(list).toMatch(/^\s*Add a member\s*$/m);
    expect(list).toMatch(/^\s*Report a leaver\s*$/m);
  });

  it("keeps the route and the model name — only the copy changed", () => {
    // Renaming the route or the Prisma model would be churn with real
    // regression risk and no benefit to an HR user, who never sees either.
    expect(nav).toContain('href: "/hr/endorsements"');
  });
});

// ─── DEF-047 — one unambiguous control, a legible counterparty ──────────────

describe("DEF-047 the approval panel", () => {
  const page = read("src/app/(admin)/endorsements/[id]/page.tsx");

  it("no longer carries a second Approve in the header", () => {
    // "One endorsement screen presents five overlapping action controls with no
    // stated difference ... 'Approve' and 'Approve & Apply' are never
    // distinguished, so a checker cannot tell which one applies the change."
    // Match the JSX text node, not the comment recording what was removed.
    expect(page).not.toMatch(/^\s*<CheckCircle size=\{15\} \/> Approve & Apply\s*$/m);
    expect(page).toMatch(/approve or reject it in Workflow Actions/i);
  });

  it("exactly one Approve control remains", () => {
    expect(page.match(/approveAmendmentAction/g)?.length).toBe(2); // import + one form
    // The legacy engine's actions are no longer reachable from this page at all.
    expect(page).not.toContain("approveEndorsementAction");
    expect(page).not.toContain("rejectEndorsementAction");
  });

  it("never renders a raw internal id as a person", () => {
    // The run saw "Maker cmsoxn5j0002tbpvqg8gomey4".
    expect(page).not.toMatch(/endorsement\.requestedBy \?\? "—"/);
    expect(page).toMatch(/No longer a user/);
  });

  it("states the object being approved, its reference and when it was raised", () => {
    // "No version of the affected object is identified anywhere."
    expect(page).toMatch(/You are approving/);
    expect(page).toContain("endorsement.endorsementNumber");
    expect(page).toContain("endorsement.group.name");
  });

  it("renders money without a phantom minor unit", () => {
    // "+UGX 1,130,958.904" — three decimals on a currency with no minor unit
    // in practice. formatMoney rounds to whole units.
    expect(page).not.toMatch(/toLocaleString\("en-UG"\)/);
    expect(page).toContain("formatMoney");
  });
});
