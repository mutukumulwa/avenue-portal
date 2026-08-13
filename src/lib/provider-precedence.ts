/**
 * UAT-HF P09.05 — deterministic provider-rule precedence (DEF-054, DEF-055).
 *
 * The run configured INCLUDE "all PANEL providers" and EXCLUDE "Agape Medical
 * Centre" (a PANEL provider) on one package and found that the screen "renders
 * them side by side with no conflict badge, no ordering, no priority column and
 * no warning ... A scan of the page for precedence language (wins / takes
 * precedence / overrides / priority / order) returns nothing."
 *
 * Two separate problems sit behind that sentence.
 *
 * ## 1. The answer was never expressed
 *
 * The engine did have an answer — any EXCLUDE won — but it lived three times, in
 * three services, and nowhere the operator could read it. So a network could be
 * configured with no way to know whether a hospital was payable.
 *
 * ## 2. "Any EXCLUDE wins" is the wrong answer at the edge
 *
 * DEC-04 fixes the ladder, highest wins:
 *
 *   1. Specific provider `EXCLUDE`
 *   2. Specific provider `INCLUDE`
 *   3. Tier rule
 *
 * The change of behaviour is at rank 2 vs rank 3. Under the old code, EXCLUDE
 * "all PANEL" plus INCLUDE "Agape" made Agape out-of-network — the operator
 * named a hospital and the product ignored them. Under DEC-04 the specific
 * INCLUDE wins, because naming one provider is a deliberate carve-out from a
 * blanket tier rule. The run's own configuration is unaffected: a specific
 * EXCLUDE still beats a tier INCLUDE, and still beats everything else.
 *
 * ## Ties
 *
 * `priority` breaks ties within a rank (higher wins). Two rules at the same rank
 * AND the same priority whose effective windows overlap are **ambiguous** — the
 * result would depend on whatever order the database happened to return. That is
 * exactly the bug found in the Diagnosis Gate work, where row order decided which
 * condition's rules ran, so it is rejected at authoring time by
 * `detectProviderRuleConflicts` rather than resolved by luck.
 *
 * If an ambiguous pair reaches the evaluator anyway (rows written before this
 * shipped, or by a path that skipped the detector), `resolveProviderRule` fails
 * **closed**: ambiguous means not payable, and says so in the trace. It never
 * silently picks one.
 *
 * ## The trace never reaches a member
 *
 * `ProviderRuleVerdict.trace` names rule IDs and internal reasons. It exists so
 * an operator can be told why, and so a claim can be defended. Member-facing
 * copy uses `memberSafeReason` only.
 */

/** The shape every caller must supply. Deliberately not the Prisma row type — three services read different column subsets. */
export interface ProviderRuleInput {
  id: string;
  inclusionType: "INCLUDE" | "EXCLUDE";
  /** Set when the rule names one provider. */
  providerId?: string | null;
  /** Set when the rule covers a whole tier. */
  providerTier?: string | null;
  /** Tie-break within a rank. Higher wins. */
  priority?: number | null;
  effectiveFrom?: Date | string | null;
  effectiveTo?: Date | string | null;
  isActive?: boolean | null;
}

export interface ProviderRef {
  id: string;
  tier: string;
}

/**
 * DEC-04's ladder as a number. Higher outranks lower.
 *
 * Kept as one exported constant so the authoring UI can sort and label rules
 * with the same ranking the evaluator applies — a second copy in the UI is a
 * second chance to disagree, which is the defect.
 */
export const PROVIDER_RULE_RANK = {
  /** 1. Specific provider EXCLUDE. */
  SPECIFIC_EXCLUDE: 30,
  /** 2. Specific provider INCLUDE. */
  SPECIFIC_INCLUDE: 20,
  /** 3. Tier rule, either direction. */
  TIER: 10,
} as const;

export type ProviderRuleDecision =
  /** A rule named this provider (or its tier) and admits it. */
  | "INCLUDED"
  /** A rule named this provider (or its tier) and refuses it. */
  | "EXCLUDED"
  /** INCLUDE rules exist but none matches — whitelist mode, provider is off-list. */
  | "NOT_LISTED"
  /** No rule of any kind applies. The package does not restrict its network. */
  | "UNRESTRICTED"
  /** Two rules of equal standing disagree. Fails closed. */
  | "AMBIGUOUS";

export interface ProviderRuleVerdict {
  decision: ProviderRuleDecision;
  /** True when the provider may be used. `NOT_LISTED` and `AMBIGUOUS` are both false. */
  payable: boolean;
  /** The rule that decided it, when one did. */
  winningRuleId: string | null;
  /** Operator/audit-facing. Names rule IDs. NEVER shown to a member. */
  trace: string;
  /** Safe to show a member or a provider portal. Says the outcome, not the rule set. */
  memberSafeReason: string | null;
}

/** The rank a rule occupies on DEC-04's ladder, or null if it names neither a provider nor a tier. */
export function rankOf(rule: ProviderRuleInput): number | null {
  if (rule.providerId) {
    return rule.inclusionType === "EXCLUDE"
      ? PROVIDER_RULE_RANK.SPECIFIC_EXCLUDE
      : PROVIDER_RULE_RANK.SPECIFIC_INCLUDE;
  }
  if (rule.providerTier) return PROVIDER_RULE_RANK.TIER;
  // A rule naming neither is not a rule. It cannot match anything, so it never
  // wins — but it must not crash the evaluator either.
  return null;
}

/** Whether a rule is in force at `at`. A rule with no window is always in force. */
export function isRuleInForce(rule: ProviderRuleInput, at: Date): boolean {
  if (rule.isActive === false) return false;
  if (rule.effectiveFrom && new Date(rule.effectiveFrom) > at) return false;
  if (rule.effectiveTo && new Date(rule.effectiveTo) < at) return false;
  return true;
}

/** Whether a rule addresses this provider at all. */
export function ruleMatches(rule: ProviderRuleInput, provider: ProviderRef): boolean {
  if (rule.providerId) return rule.providerId === provider.id;
  if (rule.providerTier) return rule.providerTier === provider.tier;
  return false;
}

/** Do two effective windows overlap? Absent bounds are open-ended. */
function windowsOverlap(a: ProviderRuleInput, b: ProviderRuleInput): boolean {
  const aFrom = a.effectiveFrom ? new Date(a.effectiveFrom).getTime() : -Infinity;
  const aTo = a.effectiveTo ? new Date(a.effectiveTo).getTime() : Infinity;
  const bFrom = b.effectiveFrom ? new Date(b.effectiveFrom).getTime() : -Infinity;
  const bTo = b.effectiveTo ? new Date(b.effectiveTo).getTime() : Infinity;
  return aFrom <= bTo && bFrom <= aTo;
}

/**
 * Decide whether one provider is payable under one package version's rules.
 *
 * Order-independent by construction: every candidate is scored, then the maximum
 * is taken. Nothing here iterates in database order and stops early.
 */
export function resolveProviderRule(
  rules: readonly ProviderRuleInput[],
  provider: ProviderRef | null,
  at: Date = new Date(),
): ProviderRuleVerdict {
  if (!provider) {
    return {
      decision: "EXCLUDED",
      payable: false,
      winningRuleId: null,
      trace: "No provider supplied — cannot be confirmed in network.",
      memberSafeReason: "We could not confirm this provider.",
    };
  }

  const inForce = rules.filter((r) => isRuleInForce(r, at));
  if (inForce.length === 0) {
    return {
      decision: "UNRESTRICTED",
      payable: true,
      winningRuleId: null,
      trace: "No provider eligibility rules in force on this package version.",
      memberSafeReason: null,
    };
  }

  const applicable = inForce
    .filter((r) => ruleMatches(r, provider))
    .map((r) => ({ rule: r, rank: rankOf(r) }))
    .filter((c): c is { rule: ProviderRuleInput; rank: number } => c.rank !== null);

  if (applicable.length === 0) {
    // Rules exist but none names this provider. INCLUDE rules turn the package
    // into a whitelist; EXCLUDE-only rules do not.
    const hasInclude = inForce.some((r) => r.inclusionType === "INCLUDE" && rankOf(r) !== null);
    if (hasInclude) {
      return {
        decision: "NOT_LISTED",
        payable: false,
        winningRuleId: null,
        trace:
          "Whitelist mode: this package version lists approved providers and this one is not among them.",
        memberSafeReason: "This provider is not on your plan's approved list.",
      };
    }
    return {
      decision: "UNRESTRICTED",
      payable: true,
      winningRuleId: null,
      trace: "Provider eligibility rules exist but none applies to this provider.",
      memberSafeReason: null,
    };
  }

  const best = applicable.reduce((a, b) => {
    if (b.rank !== a.rank) return b.rank > a.rank ? b : a;
    const ap = a.rule.priority ?? 0;
    const bp = b.rule.priority ?? 0;
    return bp > ap ? b : a;
  });

  // Anything sharing the winner's rank AND priority but disagreeing with it is
  // a genuine tie. Picking either one would make the answer depend on row order.
  const bestPriority = best.rule.priority ?? 0;
  const tied = applicable.filter(
    (c) =>
      c.rank === best.rank &&
      (c.rule.priority ?? 0) === bestPriority &&
      c.rule.inclusionType !== best.rule.inclusionType &&
      windowsOverlap(c.rule, best.rule),
  );

  if (tied.length > 0) {
    const ids = [best.rule.id, ...tied.map((t) => t.rule.id)].sort();
    return {
      decision: "AMBIGUOUS",
      payable: false,
      winningRuleId: null,
      trace: `Conflicting rules of equal precedence (rank ${best.rank}, priority ${bestPriority}): ${ids.join(", ")}. Refusing rather than letting row order decide.`,
      memberSafeReason: "We could not confirm cover at this provider. Please contact us before treatment.",
    };
  }

  if (best.rule.inclusionType === "EXCLUDE") {
    return {
      decision: "EXCLUDED",
      payable: false,
      winningRuleId: best.rule.id,
      trace: `Rule ${best.rule.id} (${describeRule(best.rule)}) excludes this provider at rank ${best.rank}.`,
      memberSafeReason: "This provider is not covered by your plan.",
    };
  }

  return {
    decision: "INCLUDED",
    payable: true,
    winningRuleId: best.rule.id,
    trace: `Rule ${best.rule.id} (${describeRule(best.rule)}) includes this provider at rank ${best.rank}.`,
    memberSafeReason: null,
  };
}

/** Short human description of a rule, for traces and for the authoring UI. */
export function describeRule(rule: ProviderRuleInput): string {
  const scope = rule.providerId ? `provider ${rule.providerId}` : `tier ${rule.providerTier}`;
  return `${rule.inclusionType} ${scope}`;
}

export interface ProviderRuleConflict {
  ruleIds: string[];
  rank: number;
  priority: number;
  /** What the operator has to change. */
  message: string;
}

/**
 * Find pairs that would make an answer depend on database order.
 *
 * Called at authoring time so the conflict is refused before it is saved, and
 * called again by the manager UI so an operator can see conflicts already in the
 * data. Only genuine ties are reported — flagging resolvable pairs would train
 * operators to ignore the warning that matters.
 *
 * Two pairs look like conflicts and are not:
 *
 * - A specific rule against a tier rule. The ladder separates them by rank.
 * - INCLUDE **and** EXCLUDE naming the SAME provider. DEC-04 puts specific
 *   EXCLUDE at rank 1 and specific INCLUDE at rank 2, so the EXCLUDE wins. It is
 *   determinate, and it fails safe: an operator who has said "not this hospital"
 *   is obeyed. The INCLUDE is then inert, which the manager's effective-outcome
 *   panel states plainly rather than warning about.
 *
 * That leaves exactly one shape the ladder cannot separate: two TIER rules on
 * the same tier pointing opposite ways, since rank 3 covers both directions.
 */
export function detectProviderRuleConflicts(
  rules: readonly ProviderRuleInput[],
): ProviderRuleConflict[] {
  const conflicts: ProviderRuleConflict[] = [];

  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i];
      const b = rules[j];
      if (a.isActive === false || b.isActive === false) continue;
      if (a.inclusionType === b.inclusionType) continue;

      const ra = rankOf(a);
      const rb = rankOf(b);
      if (ra === null || rb === null || ra !== rb) continue;
      if ((a.priority ?? 0) !== (b.priority ?? 0)) continue;

      // Same rank means both name a provider or both name a tier; they only
      // collide if they name the SAME one.
      const sameTarget = a.providerId
        ? a.providerId === b.providerId
        : a.providerTier === b.providerTier;
      if (!sameTarget) continue;

      if (!windowsOverlap(a, b)) continue;

      conflicts.push({
        ruleIds: [a.id, b.id].sort(),
        rank: ra,
        priority: a.priority ?? 0,
        message: `${describeRule(a)} and ${describeRule(b)} have the same precedence and overlapping dates, so neither wins. Give one a higher priority, change its dates, or remove one.`,
      });
    }
  }

  return conflicts;
}

/**
 * Would adding `candidate` to `existing` create an unresolvable tie?
 *
 * The write path's guard. Returns the conflict to report, or null.
 */
export function conflictIfAdded(
  existing: readonly ProviderRuleInput[],
  candidate: ProviderRuleInput,
): ProviderRuleConflict | null {
  return detectProviderRuleConflicts([...existing, candidate]).find((c) =>
    c.ruleIds.includes(candidate.id),
  ) ?? null;
}
