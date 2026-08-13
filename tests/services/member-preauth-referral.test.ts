import { describe, it, expect } from "vitest";
import { referralWarningForProcedure } from "@/lib/member-policy-copy";
import { readFileSync } from "node:fs";

/**
 * UAT-HF P09.07 — DEF-060's third member surface.
 *
 * The run scanned three member surfaces for referral copy and found it on none.
 * `/member/benefits` and `/member/facilities` were fixed first; `/member/preauth`
 * was recorded as "still silent" and is the surface where silence costs most —
 * a member submits a request there, so a rule that will refuse it costs a wait
 * and a rejection rather than a wasted look.
 *
 * The copy resolution itself is covered by `member-policy-copy.test.ts`. These
 * pin the two things specific to this surface.
 */

const RULES = [
  {
    benefitCategories: ["OUTPATIENT"],
    serviceCodes: ["99214"],
    requiresReferral: true,
    memberSafeExplanation:
      "Specialist outpatient visits require a referral from your primary provider, except in an emergency.",
    isActive: true,
    effectiveFrom: new Date("2020-01-01"),
    effectiveTo: null,
  },
];

describe("member pre-authorisation referral copy", () => {
  it("warns on the procedure the rule names", () => {
    expect(referralWarningForProcedure(RULES, { serviceCode: "99214" })).toMatch(/referral/i);
  });

  it("stays silent on a procedure no rule covers", () => {
    expect(referralWarningForProcedure(RULES, { serviceCode: "85025", category: "LABORATORY" })).toBeNull();
  });

  it("never carries the internal source clause", () => {
    // `sourceClause` is "never member/provider-facing" per the schema. The
    // service does not SELECT it, which is stronger than remembering not to
    // render it. Asserted on the select, not on the file text — the word
    // legitimately appears in the comment explaining why it is absent.
    const service = readFileSync("src/server/services/member-preauth.service.ts", "utf8");
    expect(service).not.toContain("sourceClause: true");
    expect(service).toContain("memberSafeExplanation: true");
  });

  it("resolves the member's pinned version before the package's current one", () => {
    // F-PIN-1: a rule on a newer version is a rule that may not apply to them.
    const service = readFileSync("src/server/services/member-preauth.service.ts", "utf8");
    expect(service).toContain("context.packageVersionId ??");
  });

  it("computes the warning for the default option, not only on change", () => {
    // The select is uncontrolled apart from this state, so the browser shows
    // option one before anyone touches it. A warning that appeared only
    // `onChange` would be absent for the member who accepts the default and
    // submits — which is most of them.
    const form = readFileSync("src/app/member/preauth/new/MemberPreAuthForm.tsx", "utf8");
    expect(form).toContain("useState(options.procedures[0]?.cptCode ?? \"\")");
  });

  it("associates the warning with the field for assistive technology", () => {
    const form = readFileSync("src/app/member/preauth/new/MemberPreAuthForm.tsx", "utf8");
    expect(form).toContain('aria-describedby={referralWarning ? "preauth-referral-warning" : undefined}');
    expect(form).toContain('id="preauth-referral-warning"');
  });
});
