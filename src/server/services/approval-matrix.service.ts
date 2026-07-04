import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import type { ApprovalActionType, ApprovalMatrix, ApprovalStep, ServiceType, BenefitCategory } from "@prisma/client";
import { FxService } from "./fx.service";

/**
 * Approval-matrix engine (Medvex spec §3.1 / gap G3.1).
 *
 * Resolves exactly one governing rule for a (client, action, amount) and
 * exposes the sequential approval steps, with FX-normalised amount bands (base
 * UGX), enforced segregation of duties, and version-at-decision-time resolution
 * (the rule in force by effective date).
 */

// Seniority: lower index = more senior. A user may approve a rule if their role
// is at least as senior as the required role.
const ROLE_SENIORITY = [
  "SUPER_ADMIN",
  "FINANCE_OFFICER",
  "UNDERWRITER",
  "MEDICAL_OFFICER",
  "CLAIMS_OFFICER",
  "CUSTOMER_SERVICE",
];

export interface ResolveInput {
  actionType: ApprovalActionType;
  clientId?: string | null;
  amount?: number | null;
  currency?: string | null;
  serviceType?: ServiceType | null;
  benefitCategory?: BenefitCategory | null;
  atDate?: Date;
}

export interface ResolvedStep {
  level: number;
  requiredRole: string;
  slaMinutes: number | null;
  escalationTargetRole: string | null;
}

export interface ResolvedRule {
  matrix: ApprovalMatrix & { steps: ApprovalStep[] };
  steps: ResolvedStep[];
  baseAmount: number | null;
  /** Rate used to normalise the request amount (1 when already base). */
  fxRate: number;
  /**
   * PR-017 D1 fail-safe: true when the request carried a non-base currency but
   * no FX rate was in force — band matching is impossible, so the resolver
   * returns the *highest-requirement* rule and the caller must route to the
   * multi-level/manual path, never the lowest band.
   */
  failSafe: boolean;
}

export class ApprovalMatrixService {
  /** True if `role` is senior enough to satisfy `requiredRole`. */
  static roleAuthorised(role: string | null | undefined, requiredRole: string): boolean {
    if (!role) return false;
    const have = ROLE_SENIORITY.indexOf(role);
    const need = ROLE_SENIORITY.indexOf(requiredRole);
    if (have === -1) return false;
    if (need === -1) return role === requiredRole;
    return have <= need;
  }

  /** Maker ≠ checker. Throws FORBIDDEN when the same user tries to approve. */
  static enforceSegregationOfDuties(makerId: string, checkerId: string): void {
    if (makerId === checkerId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Segregation of duties: the maker cannot approve their own request.",
      });
    }
  }

  /** Sequential steps for a rule — explicit ApprovalSteps, else a synthetic
   *  single step (or two when requiresDual) from the legacy requiredRole. */
  static expandSteps(matrix: ApprovalMatrix & { steps: ApprovalStep[] }): ResolvedStep[] {
    if (matrix.steps.length > 0) {
      return [...matrix.steps]
        .sort((a, b) => a.level - b.level)
        .map((s) => ({
          level: s.level,
          requiredRole: s.requiredRole,
          slaMinutes: s.slaMinutes ?? matrix.slaMinutes ?? null,
          escalationTargetRole: s.escalationTargetRole ?? matrix.escalationTargetRole ?? null,
        }));
    }
    const base: ResolvedStep = {
      level: 1,
      requiredRole: matrix.requiredRole,
      slaMinutes: matrix.slaMinutes ?? null,
      escalationTargetRole: matrix.escalationTargetRole ?? null,
    };
    return matrix.requiresDual
      ? [base, { ...base, level: 2 }]
      : [base];
  }

  /**
   * Resolve the single governing rule for an action. Returns null when no rule
   * applies (caller decides the default — typically: no extra approval needed).
   */
  static async resolve(tenantId: string, input: ResolveInput): Promise<ResolvedRule | null> {
    const atDate = input.atDate ?? new Date();

    // Normalise the request amount to base (UGX) for band comparison — using
    // the rate in force at the decision date (PR-017 D1).
    let baseAmount: number | null = null;
    let fxRate = 1;
    let fxMissing = false;
    if (input.amount != null) {
      const currency = input.currency ?? "UGX";
      const norm = await FxService.normalise(tenantId, input.amount, currency, atDate);
      baseAmount = norm.baseAmount;
      fxRate = norm.rate;
      fxMissing = norm.identity && currency !== "UGX";
    }

    const candidates = await prisma.approvalMatrix.findMany({
      where: {
        tenantId,
        actionType: input.actionType,
        isActive: true,
        effectiveFrom: { lte: atDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: atDate } }],
        // client-specific OR all-clients
        AND: [{ OR: [{ clientId: input.clientId ?? null }, { clientId: null }] }],
      },
      include: { steps: true },
      orderBy: { effectiveFrom: "desc" }, // most recent version first for tie-breaks
    });

    // ── FX fail-safe (PR-017 D1) ─────────────────────────────────────────────
    // A missing rate means the amount cannot be banded. Never fall through to
    // the lowest band: return the candidate with the *most demanding* approval
    // path (most steps, then highest band floor) flagged failSafe so the
    // caller opens a multi-level ApprovalRequest / manual review.
    if (fxMissing) {
      const dimensionOk = candidates.filter((rule) => {
        if (rule.serviceType && input.serviceType && rule.serviceType !== input.serviceType) return false;
        if (rule.benefitCategory && input.benefitCategory && rule.benefitCategory !== input.benefitCategory) return false;
        return true;
      });
      if (dimensionOk.length === 0) return null;
      const mostDemanding = [...dimensionOk].sort((a, b) => {
        const stepsA = this.expandSteps(a).length;
        const stepsB = this.expandSteps(b).length;
        if (stepsA !== stepsB) return stepsB - stepsA;
        return Number(b.claimValueMin ?? 0) - Number(a.claimValueMin ?? 0);
      })[0];
      return {
        matrix: mostDemanding,
        steps: this.expandSteps(mostDemanding),
        baseAmount: null,
        fxRate: 1,
        failSafe: true,
      };
    }

    let best: { score: number; rule: (typeof candidates)[number] } | null = null;

    for (const rule of candidates) {
      // Amount band (normalise the rule's band to base for comparison).
      if (baseAmount != null) {
        const min = rule.claimValueMin != null
          ? (await FxService.normalise(tenantId, Number(rule.claimValueMin), rule.currency, atDate)).baseAmount
          : null;
        const max = rule.claimValueMax != null
          ? (await FxService.normalise(tenantId, Number(rule.claimValueMax), rule.currency, atDate)).baseAmount
          : null;
        if (min != null && baseAmount < min) continue;
        if (max != null && baseAmount > max) continue;
      }
      // Dimension filters (match or wildcard).
      if (rule.serviceType && input.serviceType && rule.serviceType !== input.serviceType) continue;
      if (rule.benefitCategory && input.benefitCategory && rule.benefitCategory !== input.benefitCategory) continue;

      // Specificity score: client-specific and narrower dimensions win.
      let score = 0;
      if (rule.clientId) score += 100;
      if (rule.serviceType) score += 10;
      if (rule.benefitCategory) score += 10;
      if (rule.claimValueMin != null) score += 1;
      if (!best || score > best.score) best = { score, rule };
    }

    if (!best) return null;
    return {
      matrix: best.rule,
      steps: this.expandSteps(best.rule),
      baseAmount,
      fxRate,
      failSafe: false,
    };
  }
}
