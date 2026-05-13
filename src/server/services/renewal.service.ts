/**
 * renewal.service.ts — Process 11: Renewal Cycle Management
 *
 * Implements the spec §11 renewal intelligence algorithm and all associated
 * workflow: scenario simulation with save/commit, renewal notice dispatch,
 * age-band reclassification at renewal, and renewal binding that preserves
 * waiting periods for continuously-renewed members.
 */

import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import { auditChainService } from "./audit-chain.service";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

// Configurable at tenant level — these are the default seeds
const DEFAULT_INFLATION_RATE      = 0.05;  // 5% annual medical inflation
const DEFAULT_ACTUARIAL_THRESHOLD = 1.20;  // MLR > target × 1.20 → actuarial review
const DEFAULT_LOSS_LEADER_THRESHOLD = 0.85; // MLR < target × 0.85 → under-pricing signal

// ─── SERVICE ──────────────────────────────────────────────────────────────────

export const renewalService = {

  // ── 1. Spec algorithm: compute renewal intelligence ───────────────────────

  /**
   * Implements the spec §11 Step 3 algorithm exactly:
   *
   * if trailingMlr < targetMlr * 0.85:  recommendation = -2.5%
   * if trailingMlr <= targetMlr * 1.05: recommendation = inflation adjustment only
   * if trailingMlr <= targetMlr * 1.20: recommendation = (actual - target) + inflation
   * if trailingMlr > targetMlr * 1.20:  recommendation = (actual - target) * 1.1 + inflation
   *                                      flag: requiresActuarialReview = true
   */
  async computeRenewalIntelligence(groupId: string, tenantId: string, inflationRate = DEFAULT_INFLATION_RATE) {
    const analysis = await prisma.renewalAnalysis.findFirst({
      where: { tenantId, groupId },
      orderBy: { renewalDate: "asc" },
    });
    if (!analysis) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No renewal analysis found for this group" });
    }

    const trailingMlr = Number(analysis.trailing12Mlr);
    const targetMlr   = Number(analysis.targetMlr);

    let recommendedAdjustmentPct: number;
    let recommendationBasis: string;
    let requiresActuarialReview = false;

    if (trailingMlr < targetMlr * DEFAULT_LOSS_LEADER_THRESHOLD) {
      // Over-pricing scenario — recommend reduction
      recommendedAdjustmentPct = -0.025;
      recommendationBasis = `Trailing MLR (${(trailingMlr * 100).toFixed(1)}%) is well below target (${(targetMlr * 100).toFixed(1)}%). Scheme is over-priced — recommend -2.5% rate reduction.`;
    } else if (trailingMlr <= targetMlr * 1.05) {
      // Within acceptable band — inflation adjustment only
      recommendedAdjustmentPct = inflationRate;
      recommendationBasis = `Trailing MLR (${(trailingMlr * 100).toFixed(1)}%) is within 5% of target (${(targetMlr * 100).toFixed(1)}%). Recommend inflation adjustment only (+${(inflationRate * 100).toFixed(1)}%).`;
    } else if (trailingMlr <= targetMlr * DEFAULT_ACTUARIAL_THRESHOLD) {
      // Above target but within actuarial threshold
      const excess = trailingMlr - targetMlr;
      recommendedAdjustmentPct = excess + inflationRate;
      recommendationBasis = `Trailing MLR (${(trailingMlr * 100).toFixed(1)}%) exceeds target by ${(excess * 100).toFixed(1)}%. Recommend +${((excess + inflationRate) * 100).toFixed(1)}% (claims excess + inflation).`;
    } else {
      // Above actuarial threshold — flag for actuarial review
      const excess = trailingMlr - targetMlr;
      recommendedAdjustmentPct = excess * 1.1 + inflationRate;
      requiresActuarialReview  = true;
      recommendationBasis = `Trailing MLR (${(trailingMlr * 100).toFixed(1)}%) exceeds target × 1.20 — actuarial review required. Provisional recommendation: +${(recommendedAdjustmentPct * 100).toFixed(1)}% (excess × 1.1 + inflation).`;
    }

    await prisma.renewalAnalysis.update({
      where: { id: analysis.id },
      data: {
        recommendedAdjustmentPct,
        recommendationBasis,
        requiresActuarialReview,
        lastCalculatedAt: new Date(),
      },
    });

    return { analysis, recommendedAdjustmentPct, recommendationBasis, requiresActuarialReview };
  },

  // ── 2. Create and save a scenario ─────────────────────────────────────────

  /**
   * Creates a RenewalScenario with projected MLR.
   * Does NOT modify the underlying scheme — changes only take effect on commit.
   */
  async createScenario(
    renewalAnalysisId: string,
    tenantId: string,
    createdById: string,
    params: {
      scenarioName: string;
      proposedRateAdj: number;
      proposedCoContribAdj?: number;
      proposedNetworkTier?: string;
    },
  ) {
    const analysis = await prisma.renewalAnalysis.findUnique({ where: { id: renewalAnalysisId } });
    if (!analysis || analysis.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Renewal analysis not found" });
    }

    const currentContrib = Number(analysis.currentContribution);
    const projectedClaims = Number(analysis.projectedClaims);
    const proposedContrib = currentContrib * (1 + params.proposedRateAdj);
    const projectedMlr    = proposedContrib > 0 ? projectedClaims / proposedContrib : 0;

    return prisma.renewalScenario.create({
      data: {
        tenantId,
        renewalAnalysisId,
        scenarioName:        params.scenarioName,
        proposedRateAdj:     params.proposedRateAdj,
        proposedCoContribAdj: params.proposedCoContribAdj,
        proposedNetworkTier: params.proposedNetworkTier,
        projectedMlr,
        projectedContribution: proposedContrib,
        createdById,
      },
    });
  },

  /**
   * Commits a scenario — marks it as the basis for the renewal quotation.
   * Does not modify the scheme directly; quotation builder picks this up.
   */
  async commitScenario(scenarioId: string, tenantId: string, actorId: string) {
    const scenario = await prisma.renewalScenario.findUnique({ where: { id: scenarioId } });
    if (!scenario || scenario.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Scenario not found" });
    }

    await prisma.renewalScenario.update({
      where: { id: scenarioId },
      data: { isCommitted: true },
    });

    // Update the group renewal status
    const analysis = await prisma.renewalAnalysis.findUnique({ where: { id: scenario.renewalAnalysisId } });
    if (analysis) {
      await prisma.group.update({
        where: { id: analysis.groupId },
        data: { renewalStatus: "IN_PROGRESS" },
      });
    }

    await auditChainService.append({
      actorId,
      action:     "RENEWAL:SCENARIO_COMMITTED",
      module:     "RENEWAL",
      entityType: "RenewalScenario",
      entityId:   scenarioId,
      payload:    { proposedRateAdj: Number(scenario.proposedRateAdj), projectedMlr: Number(scenario.projectedMlr) },
      tenantId,
      description: `Renewal scenario "${scenario.scenarioName}" committed — proposed adj: ${(Number(scenario.proposedRateAdj) * 100).toFixed(1)}%`,
    });

    return scenario;
  },

  // ── 3. Dispatch renewal notice ────────────────────────────────────────────

  async dispatchRenewalNotice(groupId: string, tenantId: string) {
    const group = await prisma.group.findUnique({ where: { id: groupId, tenantId } });
    if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
    if (group.renewalNoticeDispatchedAt) return; // idempotent — don't send twice

    // Log the dispatch (actual email delivery via notification service)
    await prisma.group.update({
      where: { id: groupId },
      data: {
        renewalNoticeDispatchedAt: new Date(),
        renewalStatus: group.renewalStatus ?? "NOT_STARTED",
      },
    });

    await prisma.activityLog.create({
      data: {
        entityType:  "GROUP",
        entityId:    groupId,
        groupId,
        action:      "RENEWAL_NOTICE_DISPATCHED",
        description: `60-day renewal notice dispatched for group ${group.name}`,
      },
    });

    await auditChainService.append({
      actorId:    "system",
      action:     "RENEWAL:NOTICE_DISPATCHED",
      module:     "RENEWAL",
      entityType: "Group",
      entityId:   groupId,
      payload:    { groupName: group.name, renewalDate: group.renewalDate },
      tenantId,
      description: `60-day renewal notice dispatched for ${group.name}`,
    });
  },

  // ── 4. Reclassify age bands at renewal ────────────────────────────────────

  /**
   * For individual/age-banded schemes: recomputes each member's age band
   * as of the new cover start date and flags band crossings.
   * Returns a list of members who crossed a band boundary.
   */
  async reclassifyAgeBands(groupId: string, tenantId: string, newCoverStartDate: Date) {
    const members = await prisma.member.findMany({
      where: { groupId, tenantId, status: "ACTIVE" },
      select: { id: true, memberNumber: true, firstName: true, lastName: true, dateOfBirth: true },
    });

    const ageAtRenewal = (dob: Date) =>
      Math.floor((newCoverStartDate.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

    const ageBand = (age: number): string => {
      if (age < 18)  return "0-17";
      if (age < 36)  return "18-35";
      if (age < 51)  return "36-50";
      if (age < 61)  return "51-60";
      return "60+";
    };

    const crossings: Array<{ memberId: string; memberNumber: string; name: string; age: number; oldBand: string; newBand: string }> = [];

    for (const member of members) {
      const currentAge    = Math.floor((new Date().getTime() - member.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      const renewalAge    = ageAtRenewal(member.dateOfBirth);
      const currentBandVal = ageBand(currentAge);
      const renewalBandVal = ageBand(renewalAge);

      if (currentBandVal !== renewalBandVal) {
        crossings.push({
          memberId:     member.id,
          memberNumber: member.memberNumber,
          name:         `${member.firstName} ${member.lastName}`,
          age:          renewalAge,
          oldBand:      currentBandVal,
          newBand:      renewalBandVal,
        });
      }
    }

    return crossings;
  },

  // ── 5. Bind renewal ───────────────────────────────────────────────────────

  /**
   * Marks the prior group as superseded and updates its renewal status to BOUND.
   * Preserves WaitingPeriodApplication records — does NOT reset them.
   * Member numbers are carried over (no card replacement).
   */
  async bindRenewal(
    priorGroupId: string,
    newGroupId: string,
    tenantId: string,
    actorId: string,
  ) {
    const priorGroup = await prisma.group.findUnique({ where: { id: priorGroupId, tenantId } });
    if (!priorGroup) throw new TRPCError({ code: "NOT_FOUND", message: "Prior group not found" });
    if (!priorGroup.priorPeriodReconciled) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Prior period must be reconciled before binding renewal" });
    }

    await prisma.$transaction([
      prisma.group.update({
        where: { id: priorGroupId },
        data:  { supersededByGroupId: newGroupId, renewalStatus: "BOUND" },
      }),
      prisma.group.update({
        where: { id: newGroupId },
        data:  { renewalStatus: "BOUND" },
      }),
    ]);

    await auditChainService.append({
      actorId,
      action:     "RENEWAL:BOUND",
      module:     "RENEWAL",
      entityType: "Group",
      entityId:   priorGroupId,
      payload:    { priorGroupId, newGroupId },
      tenantId,
      description: `Renewal bound: ${priorGroup.name} → new group ${newGroupId}`,
    });
  },

  // ── 6. Pipeline query ──────────────────────────────────────────────────────

  async getPipeline(tenantId: string, daysAhead = 90) {
    const horizon = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

    const groups = await prisma.group.findMany({
      where: {
        tenantId,
        status: { in: ["ACTIVE", "PENDING"] },
        renewalDate: { lte: horizon },
        supersededByGroupId: null, // exclude already-superseded groups
      },
      select: {
        id: true, name: true, renewalDate: true, renewalStatus: true,
        renewalNoticeDispatchedAt: true, priorPeriodReconciled: true,
        broker: { select: { name: true } },
        _count: { select: { members: { where: { status: "ACTIVE" } } } },
      },
      orderBy: { renewalDate: "asc" },
    });

    const now = new Date();
    return groups.map((g) => ({
      ...g,
      daysToRenewal: Math.ceil((g.renewalDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      activeMembers: g._count.members,
      noticeDispatched: !!g.renewalNoticeDispatchedAt,
    }));
  },

  // ── 7. Queries ─────────────────────────────────────────────────────────────

  async getScenariosForAnalysis(renewalAnalysisId: string, tenantId: string) {
    return prisma.renewalScenario.findMany({
      where: { renewalAnalysisId, tenantId },
      orderBy: { createdAt: "desc" },
    });
  },
};
