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
import { normaliseAliasValue, normaliseCode } from "@/server/services/diagnosis-gate/pack-types";
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

  // 5. Evaluate the rules. (R2/R3/R4 land in C2.2–C2.4; the plumbing below is what
  //    decides whether their findings are acted on or merely recorded.)
  const ruleHits: ClinicalRuleHit[] = [];

  if (ruleHits.length === 0) return PASS(base);

  // 6. Act, or merely record. Routing requires BOTH the policy master switch and this
  //    specific condition being live (DG-D5) — and a catch-all can never route at all
  //    (DG-D8), enforced here as well as at write time so neither layer alone is
  //    load-bearing.
  const mayRoute = gateEnabled && group.enabledForLive && !group.isCatchAll;
  const withHits: ClinicalStageResult = { ...base, ruleHits };

  if (!mayRoute) return PASS({ ...withHits, recordOnly: true });

  const firstHit = ruleHits[0];
  return ROUTE(firstHit.routeCode, firstHit.message ?? `clinical rule ${firstHit.rule} flagged this claim`, withHits);
}
