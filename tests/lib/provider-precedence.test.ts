/**
 * UAT-HF P09.05 acceptance — "conflict matrix tests every include/exclude,
 * provider/tier, overlapping date, and co-contribution case; no order depends on
 * database return order."
 *
 * DEF-054 (S2): "Agape Medical Centre is a PANEL provider. With INCLUDE 'All
 * PANEL tier providers' and EXCLUDE 'Agape Medical Centre' both saved and both
 * Active, the section renders them side by side with no conflict badge, no
 * ordering, no priority column and no warning. A scan of the page for precedence
 * language (wins / takes precedence / overrides / priority / order) returns
 * nothing."
 *
 * DEC-04's ladder, highest wins: specific EXCLUDE, specific INCLUDE, tier rule.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  PROVIDER_RULE_RANK,
  conflictIfAdded,
  detectProviderRuleConflicts,
  isRuleInForce,
  rankOf,
  resolveProviderRule,
  type ProviderRuleInput,
} from "@/lib/provider-precedence";

const AGAPE = { id: "prov-agape", tier: "PANEL" };
const OTHER_PANEL = { id: "prov-other", tier: "PANEL" };
const OWN = { id: "prov-own", tier: "OWN" };

const NOW = new Date("2026-08-13T00:00:00Z");

const rule = (r: Partial<ProviderRuleInput> & { id: string; inclusionType: "INCLUDE" | "EXCLUDE" }): ProviderRuleInput => ({
  providerId: null,
  providerTier: null,
  ...r,
});

describe("P09.05 the ladder DEC-04 specifies", () => {
  it("ranks a specific EXCLUDE above a specific INCLUDE above a tier rule", () => {
    expect(rankOf(rule({ id: "a", inclusionType: "EXCLUDE", providerId: AGAPE.id }))).toBe(
      PROVIDER_RULE_RANK.SPECIFIC_EXCLUDE,
    );
    expect(rankOf(rule({ id: "b", inclusionType: "INCLUDE", providerId: AGAPE.id }))).toBe(
      PROVIDER_RULE_RANK.SPECIFIC_INCLUDE,
    );
    expect(rankOf(rule({ id: "c", inclusionType: "INCLUDE", providerTier: "PANEL" }))).toBe(
      PROVIDER_RULE_RANK.TIER,
    );
    expect(PROVIDER_RULE_RANK.SPECIFIC_EXCLUDE).toBeGreaterThan(PROVIDER_RULE_RANK.SPECIFIC_INCLUDE);
    expect(PROVIDER_RULE_RANK.SPECIFIC_INCLUDE).toBeGreaterThan(PROVIDER_RULE_RANK.TIER);
  });

  it("gives no rank to a rule naming neither a provider nor a tier", () => {
    // Such a row cannot match anything. It must not crash the evaluator, and it
    // must never win.
    expect(rankOf(rule({ id: "x", inclusionType: "EXCLUDE" }))).toBeNull();
  });
});

describe("P09.05 DEF-054 — the run's exact configuration", () => {
  // "INCLUDE 'All PANEL tier providers' and EXCLUDE 'Agape Medical Centre'"
  const rules = [
    rule({ id: "r-include-panel", inclusionType: "INCLUDE", providerTier: "PANEL" }),
    rule({ id: "r-exclude-agape", inclusionType: "EXCLUDE", providerId: AGAPE.id }),
  ];

  it("Agape is excluded, and the verdict names the rule that did it", () => {
    const v = resolveProviderRule(rules, AGAPE, NOW);
    expect(v.decision).toBe("EXCLUDED");
    expect(v.payable).toBe(false);
    expect(v.winningRuleId).toBe("r-exclude-agape");
  });

  it("another PANEL provider is still included", () => {
    const v = resolveProviderRule(rules, OTHER_PANEL, NOW);
    expect(v.decision).toBe("INCLUDED");
    expect(v.winningRuleId).toBe("r-include-panel");
  });

  it("an OWN-tier provider is off the whitelist", () => {
    // INCLUDE rules exist, so the package is a whitelist and silence means no.
    const v = resolveProviderRule(rules, OWN, NOW);
    expect(v.decision).toBe("NOT_LISTED");
    expect(v.payable).toBe(false);
  });

  it("the answer does not depend on the order the rows arrive in", () => {
    // The defect class this whole task exists to prevent.
    const forward = resolveProviderRule(rules, AGAPE, NOW);
    const reversed = resolveProviderRule([...rules].reverse(), AGAPE, NOW);
    expect(reversed).toEqual(forward);
  });

  it("this configuration is NOT flagged as a conflict", () => {
    // The ladder resolves it. Warning here would train operators to ignore the
    // warning that matters.
    expect(detectProviderRuleConflicts(rules)).toEqual([]);
  });
});

describe("P09.05 the case the old code got wrong", () => {
  // EXCLUDE the whole tier, then carve one hospital back in. Under the previous
  // "any EXCLUDE wins" logic the carve-out did nothing and the operator had no
  // way to tell.
  const rules = [
    rule({ id: "r-exclude-panel", inclusionType: "EXCLUDE", providerTier: "PANEL" }),
    rule({ id: "r-include-agape", inclusionType: "INCLUDE", providerId: AGAPE.id }),
  ];

  it("a specific INCLUDE beats a tier EXCLUDE", () => {
    const v = resolveProviderRule(rules, AGAPE, NOW);
    expect(v.decision).toBe("INCLUDED");
    expect(v.winningRuleId).toBe("r-include-agape");
  });

  it("every other provider in that tier stays excluded", () => {
    const v = resolveProviderRule(rules, OTHER_PANEL, NOW);
    expect(v.decision).toBe("EXCLUDED");
    expect(v.winningRuleId).toBe("r-exclude-panel");
  });

  it("is order-independent too", () => {
    expect(resolveProviderRule([...rules].reverse(), AGAPE, NOW)).toEqual(
      resolveProviderRule(rules, AGAPE, NOW),
    );
  });
});

describe("P09.05 two rules naming the SAME provider are resolved, not tied", () => {
  // DEC-04 puts specific EXCLUDE at rank 1 and specific INCLUDE at rank 2, so
  // this pair has an answer and must not be reported as a conflict. The safe
  // direction wins: an operator who has said "not this hospital" is obeyed.
  const pair = [
    rule({ id: "r-in", inclusionType: "INCLUDE", providerId: AGAPE.id }),
    rule({ id: "r-out", inclusionType: "EXCLUDE", providerId: AGAPE.id }),
  ];

  it("the specific EXCLUDE wins", () => {
    const v = resolveProviderRule(pair, AGAPE, NOW);
    expect(v.decision).toBe("EXCLUDED");
    expect(v.winningRuleId).toBe("r-out");
  });

  it("order-independently", () => {
    expect(resolveProviderRule([...pair].reverse(), AGAPE, NOW)).toEqual(
      resolveProviderRule(pair, AGAPE, NOW),
    );
  });

  it("is not reported as a conflict", () => {
    expect(detectProviderRuleConflicts(pair)).toEqual([]);
  });
});

describe("P09.05 a genuine tie is refused, never guessed", () => {
  // The only pair the ladder cannot separate: two TIER rules on the same tier,
  // pointing opposite ways. Rank 3 covers both directions, so nothing outranks
  // anything and the winner would be whichever row the database returned first.
  const tie = [
    rule({ id: "t-in", inclusionType: "INCLUDE", providerTier: "PANEL" }),
    rule({ id: "t-out", inclusionType: "EXCLUDE", providerTier: "PANEL" }),
  ];

  it("is detected at authoring time", () => {
    const conflicts = detectProviderRuleConflicts(tie);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].ruleIds).toEqual(["t-in", "t-out"]);
  });

  it("tells the operator what to change", () => {
    expect(detectProviderRuleConflicts(tie)[0].message).toMatch(
      /higher priority, change its dates, or remove one/i,
    );
  });

  it("fails CLOSED if it reaches the evaluator anyway", () => {
    // Rows written before this shipped, or by a path that skipped the guard.
    const v = resolveProviderRule(tie, AGAPE, NOW);
    expect(v.decision).toBe("AMBIGUOUS");
    expect(v.payable).toBe(false);
    expect(v.winningRuleId).toBeNull();
  });

  it("names both rules in the trace, in a stable order", () => {
    const a = resolveProviderRule(tie, AGAPE, NOW).trace;
    const b = resolveProviderRule([...tie].reverse(), AGAPE, NOW).trace;
    expect(a).toBe(b);
    expect(a).toContain("t-in");
    expect(a).toContain("t-out");
  });

  it("a named provider still escapes an ambiguous tier pair", () => {
    // The tier rules cancel each other; a rule naming this hospital outranks
    // both, so the answer is clear even though the tier is a mess.
    const withCarveOut = [...tie, rule({ id: "r-in", inclusionType: "INCLUDE", providerId: AGAPE.id })];
    const v = resolveProviderRule(withCarveOut, AGAPE, NOW);
    expect(v.decision).toBe("INCLUDED");
    expect(v.winningRuleId).toBe("r-in");
  });

  it("two tier rules on DIFFERENT tiers do not tie", () => {
    const fine = [
      rule({ id: "t1", inclusionType: "INCLUDE", providerTier: "PANEL" }),
      rule({ id: "t2", inclusionType: "EXCLUDE", providerTier: "OWN" }),
    ];
    expect(detectProviderRuleConflicts(fine)).toEqual([]);
  });

  it("an explicit priority breaks the tie", () => {
    const resolved = [
      rule({ id: "t-in", inclusionType: "INCLUDE", providerTier: "PANEL", priority: 10 }),
      rule({ id: "t-out", inclusionType: "EXCLUDE", providerTier: "PANEL", priority: 0 }),
    ];
    expect(detectProviderRuleConflicts(resolved)).toEqual([]);
    const v = resolveProviderRule(resolved, AGAPE, NOW);
    expect(v.decision).toBe("INCLUDED");
    expect(v.winningRuleId).toBe("t-in");
  });

  it("non-overlapping dates break the tie", () => {
    const sequential = [
      rule({ id: "t-in", inclusionType: "INCLUDE", providerTier: "PANEL", effectiveTo: new Date("2026-06-30") }),
      rule({ id: "t-out", inclusionType: "EXCLUDE", providerTier: "PANEL", effectiveFrom: new Date("2026-07-01") }),
    ];
    expect(detectProviderRuleConflicts(sequential)).toEqual([]);
    // In August, only the EXCLUDE is in force.
    expect(resolveProviderRule(sequential, AGAPE, NOW).decision).toBe("EXCLUDED");
    // In May, only the INCLUDE was.
    expect(resolveProviderRule(sequential, AGAPE, new Date("2026-05-01")).decision).toBe("INCLUDED");
  });

  it("an inactive rule cannot conflict with anything", () => {
    const retired = [
      rule({ id: "t-in", inclusionType: "INCLUDE", providerTier: "PANEL", isActive: false }),
      rule({ id: "t-out", inclusionType: "EXCLUDE", providerTier: "PANEL" }),
    ];
    expect(detectProviderRuleConflicts(retired)).toEqual([]);
    expect(resolveProviderRule(retired, AGAPE, NOW).decision).toBe("EXCLUDED");
  });
});

describe("P09.05 effective windows", () => {
  it("a rule with no window is always in force", () => {
    expect(isRuleInForce(rule({ id: "a", inclusionType: "INCLUDE" }), NOW)).toBe(true);
  });

  it("a future rule is not yet in force", () => {
    expect(
      isRuleInForce(rule({ id: "a", inclusionType: "INCLUDE", effectiveFrom: new Date("2027-01-01") }), NOW),
    ).toBe(false);
  });

  it("an expired rule is not in force", () => {
    expect(
      isRuleInForce(rule({ id: "a", inclusionType: "INCLUDE", effectiveTo: new Date("2026-01-01") }), NOW),
    ).toBe(false);
  });

  it("a package whose only rules have expired is unrestricted again", () => {
    const expired = [
      rule({ id: "r", inclusionType: "INCLUDE", providerTier: "OWN", effectiveTo: new Date("2026-01-01") }),
    ];
    const v = resolveProviderRule(expired, AGAPE, NOW);
    expect(v.decision).toBe("UNRESTRICTED");
    expect(v.payable).toBe(true);
  });
});

describe("P09.05 the open and empty cases", () => {
  it("no rules at all means an open network", () => {
    const v = resolveProviderRule([], AGAPE, NOW);
    expect(v.decision).toBe("UNRESTRICTED");
    expect(v.payable).toBe(true);
    expect(v.memberSafeReason).toBeNull();
  });

  it("EXCLUDE-only rules do NOT turn the package into a whitelist", () => {
    // Blocking one hospital must not silently block every hospital.
    const v = resolveProviderRule(
      [rule({ id: "r", inclusionType: "EXCLUDE", providerId: "someone-else" })],
      AGAPE,
      NOW,
    );
    expect(v.decision).toBe("UNRESTRICTED");
    expect(v.payable).toBe(true);
  });

  it("a missing provider is never payable", () => {
    const v = resolveProviderRule([], null, NOW);
    expect(v.payable).toBe(false);
  });
});

describe("P09.05 the trace is for operators, the reason is for members", () => {
  it("the trace names rule IDs", () => {
    const v = resolveProviderRule(
      [rule({ id: "r-exclude-agape", inclusionType: "EXCLUDE", providerId: AGAPE.id })],
      AGAPE,
      NOW,
    );
    expect(v.trace).toContain("r-exclude-agape");
  });

  it("the member-safe reason does not", () => {
    // DEC-04: "The evaluator returns the winning rule ID and reason in a
    // protected trace, never to the member."
    const v = resolveProviderRule(
      [rule({ id: "r-exclude-agape", inclusionType: "EXCLUDE", providerId: AGAPE.id })],
      AGAPE,
      NOW,
    );
    expect(v.memberSafeReason).toBeTruthy();
    expect(v.memberSafeReason).not.toContain("r-exclude-agape");
    expect(v.memberSafeReason).not.toMatch(/rank|priority|rule /i);
  });

  it("an ambiguous verdict tells a member to call, not that the config is broken", () => {
    const v = resolveProviderRule(
      [
        rule({ id: "t-in", inclusionType: "INCLUDE", providerTier: "PANEL" }),
        rule({ id: "t-out", inclusionType: "EXCLUDE", providerTier: "PANEL" }),
      ],
      AGAPE,
      NOW,
    );
    expect(v.decision).toBe("AMBIGUOUS");
    expect(v.memberSafeReason).toMatch(/contact us before treatment/i);
    expect(v.memberSafeReason).not.toMatch(/conflict|ambiguous|rule/i);
  });
});

describe("P09.05 the write-time guard", () => {
  it("refuses a tier rule that would tie with an existing tier rule", () => {
    const existing = [rule({ id: "t-out", inclusionType: "EXCLUDE", providerTier: "PANEL" })];
    const clash = conflictIfAdded(existing, {
      id: "__candidate__",
      inclusionType: "INCLUDE",
      providerId: null,
      providerTier: "PANEL",
    });
    expect(clash).not.toBeNull();
    expect(clash!.ruleIds).toContain("__candidate__");
  });

  it("allows a candidate the ladder can resolve", () => {
    // A specific INCLUDE against a tier EXCLUDE has an answer, so it saves.
    const existing = [rule({ id: "t-out", inclusionType: "EXCLUDE", providerTier: "PANEL" })];
    const ok = conflictIfAdded(existing, {
      id: "__candidate__",
      inclusionType: "INCLUDE",
      providerId: AGAPE.id,
      providerTier: null,
    });
    expect(ok).toBeNull();
  });

  it("allows a tier rule on a different tier", () => {
    const existing = [rule({ id: "t-out", inclusionType: "EXCLUDE", providerTier: "PANEL" })];
    expect(
      conflictIfAdded(existing, {
        id: "__candidate__",
        inclusionType: "INCLUDE",
        providerId: null,
        providerTier: "OWN",
      }),
    ).toBeNull();
  });

  it("ignores conflicts that do not involve the candidate", () => {
    // A pre-existing tie elsewhere must not block an unrelated save; the banner
    // reports it, the guard does not hold the operator hostage over it.
    const messy = [
      rule({ id: "a", inclusionType: "INCLUDE", providerTier: "PANEL" }),
      rule({ id: "b", inclusionType: "EXCLUDE", providerTier: "PANEL" }),
    ];
    const clash = conflictIfAdded(messy, {
      id: "__candidate__",
      inclusionType: "EXCLUDE",
      providerId: null,
      providerTier: "OWN",
    });
    expect(clash).toBeNull();
  });
});

/**
 * UAT-HF P09.05 — the surfaces, because a correct engine nobody can read is the
 * defect. "A scan of the page for precedence language (wins / takes precedence /
 * overrides / priority / order) returns nothing."
 */
describe("P09.05 the screen finally states the precedence", () => {
  const manager = readFileSync("src/app/(admin)/packages/[id]/edit/ProviderEligibilityManager.tsx", "utf8");

  it("uses precedence language the run scanned for and did not find", () => {
    expect(manager).toMatch(/more specific one wins/i);
    expect(manager).toMatch(/Overrides/);
    expect(manager).toMatch(/Precedence/);
  });

  it("states the ladder in order", () => {
    expect(manager).toMatch(/excludes a named provider/i);
    expect(manager).toMatch(/includes a named provider/i);
  });

  it("warns on an unresolvable conflict with role=alert", () => {
    expect(manager).toContain('role="alert"');
    expect(manager).toContain("detectProviderRuleConflicts");
  });

  it("shows the effective outcome per provider, not just the rule list", () => {
    expect(manager).toContain("Effective outcome");
    expect(manager).toMatch(/is payable/);
  });

  it("gives the delete control an accessible name", () => {
    // "Removal is a single unlabelled trash icon" (DEF-055).
    expect(manager).toMatch(/aria-label=\{`Remove rule:/);
  });

  it("does not reimplement the ranking — it imports it", () => {
    // A second copy in the UI is a second chance to disagree with the engine,
    // which is the whole defect.
    expect(manager).toContain('from "@/lib/provider-precedence"');
    expect(manager).toContain("resolveProviderRule");
  });
});

describe("P09.05 the three engine copies converged on one", () => {
  const files = [
    "src/server/services/eligibility/entitlement.ts",
    "src/server/services/preauth-adjudication.service.ts",
    "src/server/services/offline-pack.service.ts",
  ];

  it("every provider-network decision routes through the shared resolver", () => {
    for (const f of files) {
      expect(readFileSync(f, "utf8"), f).toContain("provider-precedence");
    }
  });

  it("no service filters EXCLUDE rules inline any more", () => {
    // The signature of the old duplicated logic.
    for (const f of files) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/inclusionType === "EXCLUDE" &&/);
    }
  });

  it("the authoring action refuses a conflicting rule before it is written", () => {
    const actions = readFileSync("src/app/(admin)/packages/[id]/edit/actions.ts", "utf8");
    expect(actions).toContain("conflictIfAdded");
    expect(actions).toMatch(/contradicts one already saved/i);
  });
});
