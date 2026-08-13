/**
 * UAT-HF P09.07 acceptance — "seeded policy appears consistently on authoring
 * detail, member benefits, provider decision, and enforcement trace."
 *
 * DEF-060 (S2): the package carries an active referral rule whose member-safe
 * text was already authored — "Specialist outpatient visits require a referral
 * from your primary provider, except in an emergency." — and "scanning
 * /member/benefits, /member/facilities and /member/preauth for referral or
 * emergency language returns nothing on all three. Worse, /member/facilities
 * offers a Procedure picker including 'Specialist consultation' with a cost
 * preview and no referral note."
 *
 * DEF-061 (S2): "A scan of /member/benefits for waiting-period language ...
 * returns nothing ... the member view implies every listed category is
 * immediately usable."
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertNoInternalLeak,
  exclusionNotesFor,
  policyNotesForCategory,
  referralNotesFor,
  referralWarningForProcedure,
  waitingPeriodStatus,
  resolveWaitingPeriodAnchor,
  waitingPeriodAuthoringLabel,
} from "@/lib/member-policy-copy";
import type { WaitingPeriodBasisValue } from "@/lib/member-policy-copy";

const MEMBER_SAFE =
  "Specialist outpatient visits require a referral from your primary provider, except in an emergency.";

const REFERRAL_RULE = {
  benefitCategories: ["OUTPATIENT"],
  serviceCodes: ["99245"],
  requiresReferral: true,
  emergencyException: true,
  memberSafeExplanation: MEMBER_SAFE,
  isActive: true,
  effectiveFrom: new Date("2026-08-11"),
  effectiveTo: null,
};

const NOW = new Date("2026-09-01T00:00:00Z");

describe("P09.07 DEF-061 — a waiting period says WHEN, not how long", () => {
  it("gives an eligible-from date, not a duration", () => {
    // The product knew "270d wait" all along; a member cannot act on that
    // without knowing when their cover started and doing arithmetic.
    const status = waitingPeriodStatus({
      waitingPeriodDays: 270,
      coverStartDate: new Date("2026-08-11"),
      now: NOW,
    });
    expect(status.waiting).toBe(true);
    expect(status.eligibleFrom).toBe("2027-05-08");
    expect(status.label).toMatch(/8 May 2027/);
  });

  it("says the rest of the cover still works", () => {
    // Otherwise a member reads one dormant category as a dormant policy.
    const status = waitingPeriodStatus({
      waitingPeriodDays: 270,
      coverStartDate: new Date("2026-08-11"),
      now: NOW,
    });
    expect(status.label).toMatch(/other benefits are unaffected/i);
  });

  it("counts the days still to wait", () => {
    // Cover started 11 Aug; +30 days is 10 Sep; from 1 Sep that is 9 days.
    const status = waitingPeriodStatus({
      waitingPeriodDays: 30,
      coverStartDate: new Date("2026-08-11"),
      now: new Date("2026-09-01T00:00:00Z"),
    });
    expect(status.eligibleFrom).toBe("2026-09-10");
    expect(status.daysRemaining).toBe(9);
  });

  it("is silent once the period has passed", () => {
    const status = waitingPeriodStatus({
      waitingPeriodDays: 30,
      coverStartDate: new Date("2026-01-01"),
      now: NOW,
    });
    expect(status.waiting).toBe(false);
    expect(status.label).toBe("");
  });

  it("is silent when there is no waiting period at all", () => {
    expect(waitingPeriodStatus({ waitingPeriodDays: 0, coverStartDate: new Date(), now: NOW }).label).toBe("");
    expect(waitingPeriodStatus({ waitingPeriodDays: null, coverStartDate: new Date(), now: NOW }).waiting).toBe(false);
  });

  it("says nothing rather than guessing when cover start is unknown", () => {
    // An invented eligible-from date is worse than none: a member would plan
    // care around it.
    expect(waitingPeriodStatus({ waitingPeriodDays: 270, coverStartDate: null, now: NOW }).waiting).toBe(false);
  });

  it("is exact on the boundary day", () => {
    const onTheDay = waitingPeriodStatus({
      waitingPeriodDays: 30,
      coverStartDate: new Date("2026-08-02"),
      now: new Date("2026-09-01T00:00:00Z"),
    });
    expect(onTheDay.waiting).toBe(false);
  });
});

describe("P09.07 DEF-060 — the referral text finally reaches the member", () => {
  it("surfaces the authored member-safe explanation", () => {
    const notes = referralNotesFor([REFERRAL_RULE], "OUTPATIENT", NOW);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe(MEMBER_SAFE);
  });

  it("says nothing on a category the rule does not cover", () => {
    expect(referralNotesFor([REFERRAL_RULE], "DENTAL", NOW)).toEqual([]);
  });

  it("says nothing for a rule that requires no referral", () => {
    // "No referral needed" on every category buries the one place it IS needed.
    const notes = referralNotesFor([{ ...REFERRAL_RULE, requiresReferral: false }], "OUTPATIENT", NOW);
    expect(notes).toEqual([]);
  });

  it("respects the rule's own effective window", () => {
    const future = referralNotesFor(
      [{ ...REFERRAL_RULE, effectiveFrom: new Date("2027-01-01") }],
      "OUTPATIENT",
      NOW,
    );
    expect(future).toEqual([]);

    const expired = referralNotesFor(
      [{ ...REFERRAL_RULE, effectiveTo: new Date("2026-08-20") }],
      "OUTPATIENT",
      NOW,
    );
    expect(expired).toEqual([]);
  });

  it("ignores an inactive rule", () => {
    expect(referralNotesFor([{ ...REFERRAL_RULE, isActive: false }], "OUTPATIENT", NOW)).toEqual([]);
  });

  it("treats an empty category list as applying to everything", () => {
    const global = { ...REFERRAL_RULE, benefitCategories: [] };
    expect(referralNotesFor([global], "DENTAL", NOW)).toHaveLength(1);
  });
});

describe("P09.07 DEF-060 — Find Care stops pricing a visit that will be refused", () => {
  it("warns on the procedure the run priced without a note", () => {
    // "offers a Procedure picker including 'Specialist consultation' with a
    // cost preview and no referral note, so the product leads the member to
    // plan and price exactly the visit that will be refused"
    const warning = referralWarningForProcedure([REFERRAL_RULE], { serviceCode: "99245" }, NOW);
    expect(warning).toBe(MEMBER_SAFE);
  });

  it("warns by benefit category when the code is not listed", () => {
    expect(referralWarningForProcedure([REFERRAL_RULE], { category: "OUTPATIENT" }, NOW)).toBe(MEMBER_SAFE);
  });

  it("stays quiet for a procedure that needs no referral", () => {
    expect(referralWarningForProcedure([REFERRAL_RULE], { serviceCode: "99213", category: "DENTAL" }, NOW)).toBeNull();
  });
});

describe("P09.07 one read model, so the audiences cannot disagree", () => {
  it("returns waiting, referral and exclusion notes together", () => {
    const { notes, waiting } = policyNotesForCategory({
      category: "OUTPATIENT",
      waitingPeriodDays: 270,
      coverStartDate: new Date("2026-08-11"),
      referralRules: [REFERRAL_RULE],
      exclusionRules: [
        { benefitCategories: ["OUTPATIENT"], memberSafeExplanation: "Cosmetic procedures are not covered.", isActive: true },
      ],
      now: NOW,
    });

    expect(waiting.waiting).toBe(true);
    expect(notes.map((n) => n.kind)).toEqual(["WAITING", "REFERRAL", "EXCLUSION"]);
  });

  it("puts the waiting note first — it is the one that blocks care today", () => {
    const { notes } = policyNotesForCategory({
      category: "OUTPATIENT",
      waitingPeriodDays: 270,
      coverStartDate: new Date("2026-08-11"),
      referralRules: [REFERRAL_RULE],
      now: NOW,
    });
    expect(notes[0].kind).toBe("WAITING");
  });

  it("returns nothing when there is nothing to say", () => {
    const { notes } = policyNotesForCategory({ category: "DENTAL", now: NOW });
    expect(notes).toEqual([]);
  });
});

describe("P09.07 the internal clause never leaks", () => {
  it("notes carry only the member-safe text", () => {
    const notes = referralNotesFor(
      [{ ...REFERRAL_RULE, ...({ sourceClause: "Schedule 4, clause 11(b)" } as object) }],
      "OUTPATIENT",
      NOW,
    );
    expect(JSON.stringify(notes)).not.toMatch(/Schedule 4/);
    expect(JSON.stringify(notes)).not.toMatch(/sourceClause/);
  });

  it("exclusion notes carry only the member-safe text", () => {
    const notes = exclusionNotesFor(
      [
        {
          benefitCategories: ["OUTPATIENT"],
          memberSafeExplanation: "Cosmetic procedures are not covered.",
          isActive: true,
          ...({ sourceClause: "Schedule 4" } as object),
        },
      ],
      "OUTPATIENT",
      NOW,
    );
    expect(JSON.stringify(notes)).not.toMatch(/sourceClause/);
  });

  it("assertNoInternalLeak catches a payload that carries one", () => {
    // The schema says sourceClause is "never member/provider-facing"; a comment
    // is not a control.
    expect(() => assertNoInternalLeak({ rules: [{ sourceClause: "Schedule 4" }] })).toThrow(
      /source clause reached a member-facing payload/i,
    );
  });

  it("passes a clean payload", () => {
    expect(() => assertNoInternalLeak({ notes: [{ kind: "REFERRAL", text: MEMBER_SAFE }] })).not.toThrow();
  });
});

/**
 * UAT-HF P09.07 — the copy reaches the two surfaces the run scanned.
 *
 * "Scanning /member/benefits, /member/facilities and /member/preauth for
 * referral or emergency language returns nothing on all three."
 */
describe("P09.07 the surfaces that were silent", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("member benefits renders the policy notes", () => {
    const page = read("src/app/member/benefits/page.tsx");
    expect(page).toContain("benefit.policy.notes");
  });

  it("member benefits states an eligible-from DATE, not a duration", () => {
    // "270 day waiting period" asks the member to know their cover start and
    // do arithmetic.
    const page = read("src/app/member/benefits/page.tsx");
    expect(page).toContain("benefit.policy.waiting.eligibleFrom");
    expect(page).toMatch(/Not available until/);
    expect(page).not.toMatch(/\{benefit\.waitingPeriodDays\} day waiting period/);
  });

  it("Find Care warns before it prices", () => {
    // "leads the member to plan and price exactly the visit that will be
    // refused" — the warning renders above the picker and the results.
    const map = read("src/app/member/facilities/FacilitiesMap.tsx");
    expect(map).toContain("referralWarnings[procedureCode]");
    expect(map).toMatch(/You need a referral for this/);
  });

  it("Find Care resolves the warning server-side from the member's OWN version", () => {
    // A rule read from the package's latest version is a rule that may not
    // apply to this member (F-PIN-1).
    const page = read("src/app/member/facilities/page.tsx");
    expect(page).toContain("referralWarningForProcedure");
    expect(page).toContain("member?.packageVersion?.referralRules");
  });

  it("the benefits service reads rules from the member's pinned version", () => {
    const service = read("src/server/services/member-app.service.ts");
    expect(service).toContain("member.packageVersion?.referralRules");
    expect(service).toContain("policyNotesForCategory");
  });

  it("neither surface FETCHES the internal source clause", () => {
    // Not selecting it is a stronger guarantee than remembering not to render
    // it. A crude grep for the word matches the comments explaining that, so
    // this asserts the query shape instead: an explicit member-safe select,
    // and never a bare `referralRules: true` that would pull every column.
    for (const p of [
      "src/app/member/facilities/page.tsx",
      "src/server/services/member-app.service.ts",
    ]) {
      const src = read(p);
      expect(src, p).toContain("memberSafeExplanation: true");
      expect(src, p).not.toMatch(/referralRules:\s*true/);
      // The clause must never appear inside a select block.
      expect(src, p).not.toMatch(/sourceClause:\s*true/);
    }
  });
});

/**
 * UAT-HF P09.03 — the configurable basis (DEF-022).
 *
 * "The product never states what the 270 days run FROM — cover start,
 * enrolment date, policy inception and member join date are all plausible and
 * none is named."
 *
 * Naming it in copy was the first half. Making it a stored, per-benefit
 * decision is this half: a maternity wait measured from a late dependant's join
 * date and one measured from the family's policy start are different rules that
 * were previously indistinguishable, and the product silently applied one of
 * them.
 */
describe("P09.03 waiting-period basis", () => {
  const COVER = "2026-01-01T00:00:00Z";
  const JOIN = "2026-06-01T00:00:00Z";
  const REINSTATED = "2026-08-01T00:00:00Z";
  const NOW = new Date("2026-08-13T00:00:00Z");

  const status = (basis: WaitingPeriodBasisValue, anchors = {}) =>
    waitingPeriodStatus({
      waitingPeriodDays: 90,
      coverStartDate: COVER,
      waitingPeriodBasis: basis,
      anchors,
      now: NOW,
    });

  it("COVER_START measures from the policy start, as it always did", () => {
    expect(status("COVER_START").eligibleFrom).toBe("2026-04-01");
  });

  it("DEPENDANT_JOIN measures from the member's own join date", () => {
    // The difference is five months of cover. Guessing between them is exactly
    // what DEF-022 objects to.
    const r = status("DEPENDANT_JOIN", { dependantJoinDate: JOIN });
    expect(r.eligibleFrom).toBe("2026-08-30");
    expect(r.waiting).toBe(true);
  });

  it("REINSTATEMENT measures from the reinstatement date", () => {
    expect(status("REINSTATEMENT", { reinstatementDate: REINSTATED }).eligibleFrom).toBe("2026-10-30");
  });

  it("OTHER_APPROVED uses the approved date and nothing else", () => {
    expect(status("OTHER_APPROVED", { approvedBasisDate: "2026-07-01T00:00:00Z" }).eligibleFrom).toBe(
      "2026-09-29",
    );
  });

  it("reports UNRESOLVED rather than falling back when the basis date is missing", () => {
    // The dangerous answer is "no wait": it tells a member their maternity
    // cover is live when in fact nobody knows. Silently using cover start
    // instead would give a confident wrong date, which is the same failure in
    // a different costume.
    const r = status("OTHER_APPROVED");
    expect(r.unresolved).toBe(true);
    expect(r.waiting).toBe(false);
    expect(r.eligibleFrom).toBeNull();
    expect(r.label).toMatch(/do not have that date|contact your administrator/i);
    expect(r.label).not.toMatch(/2026-04-01|1 Apr/);
  });

  it("a missing dependant join date does not quietly become the policy start", () => {
    expect(status("DEPENDANT_JOIN").unresolved).toBe(true);
  });

  it("no wait at all stays no wait, whatever the basis", () => {
    const r = waitingPeriodStatus({
      waitingPeriodDays: 0,
      coverStartDate: COVER,
      waitingPeriodBasis: "OTHER_APPROVED",
      now: NOW,
    });
    expect(r).toMatchObject({ waiting: false, unresolved: false, label: "" });
  });

  it("defaults to COVER_START when no basis is supplied", () => {
    // Every row that predates the column keeps its current meaning, which is
    // why the migration needs no backfill.
    expect(
      waitingPeriodStatus({ waitingPeriodDays: 90, coverStartDate: COVER, now: NOW }).eligibleFrom,
    ).toBe("2026-04-01");
  });

  it("the maker-facing label names the basis instead of implying one", () => {
    expect(waitingPeriodAuthoringLabel(270, "DEPENDANT_JOIN")).toBe(
      "270 days from the date this member joined the policy",
    );
    // The run's entire maker-facing disclosure was the fragment "270d wait".
    expect(waitingPeriodAuthoringLabel(270, "COVER_START")).toMatch(/from the policy cover start date/);
  });

  it("resolveWaitingPeriodAnchor never substitutes one basis for another", () => {
    const anchors = { coverStartDate: COVER, dependantJoinDate: JOIN, reinstatementDate: REINSTATED };
    expect(resolveWaitingPeriodAnchor("COVER_START", anchors)).toBe(COVER);
    expect(resolveWaitingPeriodAnchor("DEPENDANT_JOIN", anchors)).toBe(JOIN);
    expect(resolveWaitingPeriodAnchor("REINSTATEMENT", anchors)).toBe(REINSTATED);
    expect(resolveWaitingPeriodAnchor("OTHER_APPROVED", anchors)).toBeNull();
  });
});

/**
 * UAT-HF P09.03 — the member read path actually supplies the anchors.
 *
 * The first P09.03 commit added the basis and the evaluator but left every
 * caller passing `coverStartDate` alone, so a DEPENDANT_JOIN or REINSTATEMENT
 * benefit resolved as `unresolved` on the surfaces that matter. That is the
 * safe direction, not a finished one.
 */
describe("P09.03 the member benefit view carries the basis", () => {
  const service = readFileSync("src/server/services/member-app.service.ts", "utf8");

  it("passes the benefit's own basis, not one assumed for the member", () => {
    expect(service).toContain("waitingPeriodBasis: benefit.waitingPeriodBasis");
  });

  it("distinguishes the policy start from the member's own", () => {
    // A dependant added mid-year has a later start than the family policy.
    // Collapsing the two would make DEPENDANT_JOIN a label rather than a rule.
    expect(service).toContain("member.principal?.coverStartDate ?? member.coverStartDate");
    expect(service).toContain("dependantJoinDate: member.coverStartDate");
  });

  it("joins the principal and the coverage periods on every benefit read", () => {
    // Four call sites feed buildBenefitStates; a query that omits the join
    // silently degrades to the old single-date behaviour.
    expect(service.split("principal: { select: { coverStartDate: true } }").length - 1).toBe(4);
    expect(service.split('coveragePeriods: { select: { startDate: true, reason: true }').length - 1).toBe(4);
  });

  it("does not invent an approved basis date", () => {
    expect(service).toContain("approvedBasisDate: null");
  });

  it("an unresolved wait still produces a member-facing note", () => {
    // Rendering nothing would put the member back where DEF-061 found them:
    // a benefit that looks immediately usable when nobody knows.
    const { notes, waiting } = policyNotesForCategory({
      category: "MATERNITY",
      waitingPeriodDays: 270,
      waitingPeriodBasis: "OTHER_APPROVED",
      coverStartDate: "2026-01-01T00:00:00Z",
      now: new Date("2026-08-13T00:00:00Z"),
    });
    expect(waiting.unresolved).toBe(true);
    expect(notes.some((n) => n.kind === "WAITING")).toBe(true);
  });
});
