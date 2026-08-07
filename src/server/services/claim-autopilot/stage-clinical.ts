/**
 * Claims Autopilot — CLINICAL stage (Diagnosis Gate C2.1).
 *
 * Runs between DUPLICATE and CONTRACT: it needs only the diagnosis, the coded lines and
 * the member's claim history, so an out-of-scope or protocol-flagged claim is settled
 * before the expensive contract evaluation.
 *
 * TWO PROPERTIES THAT MATTER MORE THAN THE RULES THEMSELVES:
 *
 * 1. RECORD-ONLY BY DEFAULT (DG-D4). The stage always evaluates and always persists
 *    what it found, but returns PASS unless the gate has been deliberately switched on
 *    for this policy AND for this specific condition. The persisted findings ARE the
 *    shadow campaign — there is no separate shadow pipeline to drift out of sync with
 *    the real one, because the measurement path and the enforcement path are the same
 *    code reading the same claim.
 *
 * 2. IT NEVER DECLINES (DG-D1). Every outcome is PASS or ROUTE-to-a-human. A protocol
 *    or coding error must not auto-deny care costs.
 *
 * The stage is read-only with respect to claim and line money: it writes nothing but
 * its own stage row (recorded by the evaluator, not here).
 */
import type { PrismaClient } from "@prisma/client";
import { ROUTE_CODES, type RouteCode } from "@/server/services/claim-intake/reason-catalog";
import { normaliseAliasValue, normaliseCode, isSubDayWindow, windowDays, dayDifference } from "@/server/services/diagnosis-gate/pack-types";
import type { EvalContext, StageOutcome } from "./evaluate";

/** One thing the clinical rules found wrong. Persisted on the stage row verbatim. */
export interface ClinicalRuleHit {
  rule: "R2" | "R3" | "R4";
  routeCode: RouteCode;
  /** The claim line that triggered it, when the rule is line-specific. */
  claimLineId?: string;
  testCode?: string;
  testName?: string;
  /** The pack's own provider-facing wording for this test, when it has one. */
  message?: string;
  /** Safe references only — claim numbers, never amounts or clinical detail. */
  priorClaimNumbers?: string[];
}

/**
 * A rule the pack defines but this evaluation could NOT check (DG-D14).
 *
 * Recorded rather than dropped: a shadow report that silently omits unevaluated rules
 * overstates coverage, and "we checked and found nothing" must never be confused with
 * "we could not check".
 */
export interface ClinicalInertRule {
  rule: "R3" | "R4";
  testCode?: string;
  testName?: string;
  windowHours: number;
  reason: "SUBDAY_WINDOW_DATE_ONLY_DATA";
}

export interface ClinicalStageResult extends Record<string, unknown> {
  packId?: string;
  packVersion?: number;
  groupCode?: string;
  groupName?: string;
  /** True when no protocol pack is in force — the gate is dormant. */
  skipped?: string;
  /** The claim's diagnosis matched no governed condition. */
  outOfScope?: boolean;
  /** More than one condition matched — recorded so the pack can be disambiguated. */
  ambiguous?: boolean;
  /** True when findings were recorded but deliberately not acted on. */
  recordOnly?: boolean;
  ruleHits?: ClinicalRuleHit[];
  /** Rules the pack defines but this evaluation could not check (DG-D14). */
  inertRules?: ClinicalInertRule[];
}

const PASS = (result?: ClinicalStageResult): StageOutcome => ({ disposition: "PASS", result });
const ROUTE = (code: RouteCode, reason: string, result?: ClinicalStageResult): StageOutcome => ({ disposition: "ROUTE", code, reason, result });

/**
 * Pull every diagnosis code off a claim.
 *
 * `Claim.diagnoses` is untyped JSON and carries TWO shapes in practice: the canonical
 * intake path writes `{ icdCode }` while `claims.service` / `reimbursement.service`
 * write `{ code }`. The claim detail screen already hedges with `d.code ?? d.icdCode`,
 * and so must we — reading only one key would make the gate silently fail to resolve a
 * whole class of claims, which looks exactly like "no problems found".
 */
export function extractDiagnosisCodes(diagnoses: unknown): { primary: string[]; all: string[] } {
  const primary: string[] = [];
  const all: string[] = [];
  if (!Array.isArray(diagnoses)) return { primary, all };
  for (const raw of diagnoses) {
    if (!raw || typeof raw !== "object") continue;
    const d = raw as Record<string, unknown>;
    const value = typeof d.code === "string" && d.code.trim() ? d.code : typeof d.icdCode === "string" ? d.icdCode : null;
    if (!value?.trim()) continue;
    const code = normaliseCode(value);
    all.push(code);
    if (d.isPrimary === true) primary.push(code);
  }
  return { primary, all };
}

/** Candidate identifiers by which a billed line might be recognised as a known test. */
export function lineMatchKeys(line: { cptCode?: string | null; drugCode?: string | null; description?: string | null }): Array<{ matchType: "CPT_CODE" | "SERVICE_CODE" | "NORMALIZED_NAME"; value: string }> {
  const keys: Array<{ matchType: "CPT_CODE" | "SERVICE_CODE" | "NORMALIZED_NAME"; value: string }> = [];
  if (line.cptCode?.trim()) keys.push({ matchType: "CPT_CODE", value: normaliseAliasValue(line.cptCode) });
  if (line.drugCode?.trim()) keys.push({ matchType: "SERVICE_CODE", value: normaliseAliasValue(line.drugCode) });
  if (line.description?.trim()) keys.push({ matchType: "NORMALIZED_NAME", value: normaliseAliasValue(line.description) });
  return keys;
}

/**
 * Resolve the claim's diagnosis to a governed condition in the active pack.
 * Primary diagnoses win; a line-level code is the fallback. Returns null when nothing
 * in the pack matches.
 */
async function resolveGroup(
  db: PrismaClient,
  packId: string,
  codes: { primary: string[]; all: string[] },
): Promise<{ groupId: string; groupCode: string; groupName: string; isCatchAll: boolean; enabledForShadow: boolean; enabledForLive: boolean; confirmationLookbackHours: number | null; ambiguous: boolean } | null> {
  const lookup = async (candidates: string[]) => {
    if (candidates.length === 0) return [];
    return db.clinicalCodeMembership.findMany({
      where: { packId, code: { in: candidates } },
      select: {
        group: {
          select: { id: true, groupCode: true, name: true, isCatchAll: true, enabledForShadow: true, enabledForLive: true, confirmationLookbackHours: true },
        },
      },
    });
  };

  // DG-D3: memberships carry their own code system, and we match on the code value
  // across both — the platform bills ICD-10 while the clinical content is authored in
  // ICD-11, and a claim should resolve under whichever system its codes came from.
  let rows = await lookup(codes.primary);
  if (rows.length === 0) rows = await lookup(codes.all);
  if (rows.length === 0) return null;

  const distinct = new Map(rows.map((r) => [r.group.id, r.group]));
  const first = [...distinct.values()][0];
  return {
    groupId: first.id,
    groupCode: first.groupCode,
    groupName: first.name,
    isCatchAll: first.isCatchAll,
    enabledForShadow: first.enabledForShadow,
    enabledForLive: first.enabledForLive,
    confirmationLookbackHours: first.confirmationLookbackHours,
    ambiguous: distinct.size > 1,
  };
}

interface MatchedRule {
  claimLineId: string;
  ruleId: string;
  testCode: string;
  testName: string;
  requiresDiagnosis: boolean;
  repeatWindowHours: number | null;
  failureMessage: string;
}

/**
 * Recognise billed lines as known tests, via the pack's aliases.
 *
 * Everything downstream depends on this: a test the pack cannot recognise on a claim is
 * a rule that can never fire. C1.5's coverage report exists to measure exactly this, and
 * the validator warns when a rule has no alias at all.
 */
async function matchLinesToRules(
  db: PrismaClient,
  packId: string,
  lines: Array<{ id: string; cptCode: string | null; drugCode: string | null; description: string }>,
): Promise<MatchedRule[]> {
  const keyed = lines.map((l) => ({ lineId: l.id, keys: lineMatchKeys(l) }));
  const distinct = new Map<string, { matchType: string; value: string }>();
  for (const { keys } of keyed) for (const k of keys) distinct.set(`${k.matchType}|${k.value}`, k);
  if (distinct.size === 0) return [];

  const aliases = await db.clinicalLineAlias.findMany({
    where: { packId, OR: [...distinct.values()].map((k) => ({ matchType: k.matchType as never, value: k.value })) },
    select: {
      matchType: true,
      value: true,
      labRule: { select: { id: true, testCode: true, testName: true, requiresDiagnosis: true, repeatWindowHours: true, failureMessage: true } },
    },
  });
  if (aliases.length === 0) return [];

  const byKey = new Map(aliases.map((a) => [`${a.matchType}|${a.value}`, a.labRule]));
  const out: MatchedRule[] = [];
  for (const { lineId, keys } of keyed) {
    for (const k of keys) {
      const rule = byKey.get(`${k.matchType}|${k.value}`);
      if (!rule) continue;
      out.push({
        claimLineId: lineId,
        ruleId: rule.id,
        testCode: rule.testCode,
        testName: rule.testName,
        requiresDiagnosis: rule.requiresDiagnosis,
        repeatWindowHours: rule.repeatWindowHours,
        failureMessage: rule.failureMessage,
      });
      break; // one line recognises as at most one test
    }
  }
  return out;
}

interface PriorLine {
  claimNumber: string;
  dateOfService: Date;
  keys: Set<string>;
}

/**
 * The member's earlier billed lines within `windowHours`, for R3 and R4.
 *
 * Matching happens in JS rather than SQL because aliases are stored normalised
 * (uppercase, whitespace-collapsed) while `ClaimLine.description` is raw. Normalising in
 * the query would need raw SQL and would risk drifting from `normaliseAliasValue`;
 * reusing `lineMatchKeys` guarantees both sides agree by construction.
 *
 * "Earlier" is a total order — service date, then creation, then id — so that when two
 * claims share a service date exactly one of them flags the other. Without the
 * tie-break, concurrent same-day submissions would either both flag or both stay silent.
 */
async function fetchPriorLines(
  db: PrismaClient,
  tenantId: string,
  claim: { id: string; memberId: string; dateOfService: Date; createdAt: Date },
  windowHours: number,
): Promise<PriorLine[]> {
  const since = new Date(claim.dateOfService.getTime() - windowHours * 3600_000);
  const candidates = await db.claim.findMany({
    where: {
      tenantId,
      memberId: claim.memberId,
      id: { not: claim.id },
      status: { notIn: ["VOID", "DECLINED", "APPEAL_DECLINED"] },
      dateOfService: { gte: since, lte: claim.dateOfService },
    },
    select: {
      id: true,
      claimNumber: true,
      dateOfService: true,
      createdAt: true,
      claimLines: { select: { cptCode: true, drugCode: true, description: true } },
    },
    orderBy: [{ dateOfService: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  const isEarlier = (c: { id: string; dateOfService: Date; createdAt: Date }) => {
    const ds = c.dateOfService.getTime() - claim.dateOfService.getTime();
    if (ds !== 0) return ds < 0;
    const ca = c.createdAt.getTime() - claim.createdAt.getTime();
    if (ca !== 0) return ca < 0;
    return c.id < claim.id;
  };

  return candidates.filter(isEarlier).map((c) => ({
    claimNumber: c.claimNumber,
    dateOfService: c.dateOfService,
    keys: new Set(c.claimLines.flatMap((l) => lineMatchKeys(l).map((k) => `${k.matchType}|${k.value}`))),
  }));
}

/** Does this test appear among a set of already-keyed prior lines? */
async function ruleAliasKeys(db: PrismaClient, ruleId: string): Promise<Set<string>> {
  const rows = await db.clinicalLineAlias.findMany({ where: { labRuleId: ruleId }, select: { matchType: true, value: true } });
  return new Set(rows.map((r) => `${r.matchType}|${r.value}`));
}

/**
 * The CLINICAL stage. Registered in EVALUATION_STAGES between DUPLICATE and CONTRACT.
 */
export async function stageClinical(ctx: EvalContext): Promise<StageOutcome> {
  const db = ctx.db as PrismaClient;

  // 1. No pack in force ⇒ the gate is dormant and every claim passes untouched. This is
  //    the state the platform ships in, and the state it returns to if content is
  //    withdrawn — so withdrawal is always safe.
  const pack = await db.clinicalProtocolPack.findFirst({
    where: { tenantId: ctx.tenantId, isActive: true },
    select: { id: true, version: true },
  });
  if (!pack) return PASS({ skipped: "NO_ACTIVE_PACK" });

  const gateEnabled = ctx.policy.clinicalGateEnabled === true;
  const requireGroup = ctx.policy.requireClinicalGroup === true;

  // 2. Resolve the claim's diagnosis to a governed condition.
  const headerCodes = extractDiagnosisCodes(ctx.claim.diagnoses);
  const lineCodes = ctx.claim.claimLines.map((l) => l.icdCode).filter((c): c is string => !!c?.trim()).map(normaliseCode);
  const codes = { primary: headerCodes.primary, all: [...new Set([...headerCodes.all, ...lineCodes])] };

  const group = await resolveGroup(db, pack.id, codes);

  // 3. Out of scope. DG-D11: by default the gate governs only what it knows and lets
  //    everything else through; narrowing the automated path to governed conditions
  //    only is a separate, deliberate business switch.
  if (!group) {
    const result: ClinicalStageResult = { packId: pack.id, packVersion: pack.version, outOfScope: true };
    if (gateEnabled && requireGroup) {
      return ROUTE(ROUTE_CODES.CLINICAL_SCOPE_REVIEW, "diagnosis is not in the governed clinical scope", result);
    }
    return PASS(result);
  }

  const base: ClinicalStageResult = {
    packId: pack.id,
    packVersion: pack.version,
    groupCode: group.groupCode,
    groupName: group.groupName,
    ...(group.ambiguous ? { ambiguous: true } : {}),
  };

  // 4. A condition switched off for shadow is not evaluated at all — the clinical team
  //    can silence a noisy condition without withdrawing the whole pack.
  if (!group.enabledForShadow) return PASS({ ...base, skipped: "GROUP_DISABLED" });

  // 5. Evaluate the rules.
  const ruleHits: ClinicalRuleHit[] = [];
  const inertRules: ClinicalInertRule[] = [];
  const matched = await matchLinesToRules(db, pack.id, ctx.claim.claimLines);

  const links = await db.clinicalLabRuleGroupLink.findMany({
    where: { packId: pack.id, groupId: group.groupId },
    select: { labRuleId: true, linkType: true },
  });
  const supported = new Set(links.filter((l) => l.linkType === "SUPPORTED").map((l) => l.labRuleId));
  const confirmatory = links.filter((l) => l.linkType === "CONFIRMATORY").map((l) => l.labRuleId);

  // ── R2: is this test supported by the stated diagnosis? ───────────────────
  // Only tests the pack explicitly marks as requiring a diagnosis are checked; a test
  // that may reasonably be ordered without one is never flagged.
  for (const m of matched) {
    if (!m.requiresDiagnosis) continue;
    if (supported.has(m.ruleId)) continue;
    ruleHits.push({
      rule: "R2",
      routeCode: ROUTE_CODES.CLINICAL_LAB_UNSUPPORTED,
      claimLineId: m.claimLineId,
      testCode: m.testCode,
      testName: m.testName,
      message: m.failureMessage,
    });
  }

  // How far back any rule needs to look. One query serves both R3 and R4.
  const repeatWindows = matched.map((m) => m.repeatWindowHours ?? 0);
  const maxWindow = Math.max(0, ...repeatWindows, group.confirmationLookbackHours ?? 0);
  const priorLines = maxWindow > 0
    ? await fetchPriorLines(db, ctx.tenantId, { id: ctx.claimId, memberId: ctx.claim.memberId, dateOfService: ctx.claim.dateOfService, createdAt: ctx.claim.createdAt }, maxWindow)
    : [];

  // ── R3: was this test already done too recently to justify repeating? ─────
  // LIMIT (stated in the spec, not hidden here): only claims that reach Medvex are
  // visible. A repeat at a facility that never bills us cannot be seen.
  //
  // DG-D14: compared in whole calendar days, because that is the resolution the claim
  // data actually has. A window under a day cannot be evaluated at all and is recorded
  // as inert — see below.
  for (const m of matched) {
    if (m.repeatWindowHours == null || m.repeatWindowHours <= 0) continue;

    if (isSubDayWindow(m.repeatWindowHours)) {
      // Recorded, not silently dropped: the shadow report must be able to say which
      // rules it is NOT checking, or coverage looks better than it is.
      inertRules.push({
        rule: "R3",
        testCode: m.testCode,
        testName: m.testName,
        windowHours: m.repeatWindowHours,
        reason: "SUBDAY_WINDOW_DATE_ONLY_DATA",
      });
      continue;
    }

    const keys = await ruleAliasKeys(db, m.ruleId);
    const allowedDays = windowDays(m.repeatWindowHours);
    const priors = priorLines.filter((p) => {
      const gap = dayDifference(ctx.claim.dateOfService, p.dateOfService);
      return gap >= 0 && gap <= allowedDays && [...keys].some((k) => p.keys.has(k));
    });
    if (priors.length === 0) continue;
    ruleHits.push({
      rule: "R3",
      routeCode: ROUTE_CODES.CLINICAL_REPEAT_WINDOW,
      claimLineId: m.claimLineId,
      testCode: m.testCode,
      testName: m.testName,
      message: `${m.testName} was already performed for this member within its ${allowedDays}-day repeat window.`,
      priorClaimNumbers: priors.slice(0, 5).map((p) => p.claimNumber),
    });
  }

  // ── R4: is the confirmatory test on record? ───────────────────────────────
  // HONEST LIMIT: the platform never receives test RESULTS, so this proves only that
  // the test was BILLED — never that it was positive. It is a completeness and
  // deterrence control, not clinical verification.
  if (confirmatory.length > 0) {
    const onThisClaim = matched.some((m) => confirmatory.includes(m.ruleId));
    let inLookback = false;
    /** True when a lookback was declared but could not be evaluated (DG-D14). */
    let lookbackUnverifiable = false;
    const lookbackHours = group.confirmationLookbackHours;

    // DG-D14 again: a sub-day lookback cannot be evaluated. Recorded as inert, and the
    // finding below is suppressed — asserting "no confirmatory test on record" after
    // failing to check the record would be stating something we do not know.
    if (!onThisClaim && isSubDayWindow(lookbackHours)) {
      lookbackUnverifiable = true;
      inertRules.push({
        rule: "R4",
        windowHours: lookbackHours!,
        reason: "SUBDAY_WINDOW_DATE_ONLY_DATA",
      });
    } else if (!onThisClaim && lookbackHours != null && lookbackHours > 0) {
      const allowedDays = windowDays(lookbackHours);
      const candidates = priorLines.filter((p) => {
        const gap = dayDifference(ctx.claim.dateOfService, p.dateOfService);
        return gap >= 0 && gap <= allowedDays;
      });
      for (const ruleId of confirmatory) {
        const keys = await ruleAliasKeys(db, ruleId);
        if (candidates.some((p) => [...keys].some((k) => p.keys.has(k)))) {
          inLookback = true;
          break;
        }
      }
    }
    if (!onThisClaim && !inLookback && !lookbackUnverifiable) {
      const lookbackPhrase = lookbackHours && lookbackHours >= 24 ? ` or in the preceding ${windowDays(lookbackHours)} day(s)` : "";
      ruleHits.push({
        rule: "R4",
        routeCode: ROUTE_CODES.CLINICAL_CONFIRMATION_MISSING,
        message: `No confirmatory test for ${group.groupName} was billed on this claim${lookbackPhrase}.`,
      });
    }
  }

  // Inert rules ride along whether or not anything was found, so a clean evaluation
  // still reports what it was unable to check (DG-D14).
  const withInert: ClinicalStageResult = inertRules.length > 0 ? { ...base, inertRules } : base;

  if (ruleHits.length === 0) return PASS(withInert);

  // 6. Act, or merely record. Routing requires BOTH the policy master switch and this
  //    specific condition being live (DG-D5) — and a catch-all can never route at all
  //    (DG-D8), enforced here as well as at write time so neither layer alone is
  //    load-bearing.
  const mayRoute = gateEnabled && group.enabledForLive && !group.isCatchAll;
  const withHits: ClinicalStageResult = { ...withInert, ruleHits };

  if (!mayRoute) return PASS({ ...withHits, recordOnly: true });

  const firstHit = ruleHits[0];
  return ROUTE(firstHit.routeCode, firstHit.message ?? `clinical rule ${firstHit.rule} flagged this claim`, withHits);
}
