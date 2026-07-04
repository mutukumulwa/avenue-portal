/**
 * preauth-adjudication.service.ts — Process 8: Pre-Authorization Review
 *
 * Adds to the existing MemberPreAuthService:
 * - Full auto-decision pipeline with all 9 gates in spec order
 * - BenefitHold create / release / convert
 * - SLA deadline calculation per request type
 * - Emergency bypass flag
 * - Mid-treatment PA amendment creation
 */

import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import { auditChainService } from "./audit-chain.service";
import { BenefitUsageService } from "./benefit-usage.service";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

// Auto-approve ceiling (KES) — cases above this route to human review
const AUTO_APPROVE_CEILING_KES = 50_000;

// Procedures on the never-auto list always require human review
const NEVER_AUTO_PROCEDURE_CODES = new Set([
  "27447","27236","27130","43239","43239","47562", // orthopaedic, bariatric, laparoscopic
]);

// Procedures on the always-auto list are approved without caps check
const ALWAYS_AUTO_PROCEDURE_CODES = new Set([
  "99213","99214","85025","71046","76700","92004","80053", // routine outpatient
]);

// PA validity window: approved PAs hold benefit for this many days
const PA_VALIDITY_DAYS = 14;

// SLA deadlines per request type (minutes)
const SLA_MINUTES: Record<string, number> = {
  EMERGENCY:             30,
  INPATIENT_PREADMISSION: 60,
  OUTPATIENT:            120,
};

// ─── GATE RESULT TYPE ─────────────────────────────────────────────────────────

type GateOutcome = "PASS" | "FAIL" | "ROUTE_TO_HUMAN";
interface GateResult {
  gate: string;
  outcome: GateOutcome;
  reason?: string;
}
type AutoDecisionResult =
  | { decision: "AUTO_APPROVED"; gateLog: GateResult[] }
  | { decision: "AUTO_DECLINED"; gateLog: GateResult[]; reason: string }
  | { decision: "ROUTE_TO_HUMAN"; gateLog: GateResult[]; reason: string };

// ─── SERVICE ──────────────────────────────────────────────────────────────────

export const preauthAdjudicationService = {

  // ── 1. Full auto-decision pipeline ────────────────────────────────────────

  /**
   * Runs all 9 gates in spec §8 Step 2 order.
   * Target: < 3 seconds end-to-end.
   * Returns a structured decision with a gate-by-gate log for auditability.
   */
  async runAutoDecision(preAuthId: string, tenantId: string): Promise<AutoDecisionResult> {
    const startMs = Date.now();
    const gateLog: GateResult[] = [];

    const pa = await prisma.preAuthorization.findUnique({
      where: { id: preAuthId, tenantId },
      include: {
        member: {
          include: {
            benefitUsages: { orderBy: { periodStart: "desc" }, take: 1 },
          },
        },
        provider: { select: { id: true, name: true, contractStatus: true, tier: true } },
      },
    });
    if (!pa) throw new TRPCError({ code: "NOT_FOUND", message: "Pre-authorization not found" });

    const estimatedCost = Number(pa.estimatedCost);
    const serviceDate   = pa.expectedDateOfService ?? new Date();

    // Helper to add a gate result and short-circuit if needed
    function pass(gate: string, reason?: string): void {
      gateLog.push({ gate, outcome: "PASS", reason });
    }
    function failGate(gate: string, reason: string): AutoDecisionResult {
      gateLog.push({ gate, outcome: "FAIL", reason });
      return { decision: "AUTO_DECLINED", gateLog, reason };
    }
    function routeHuman(gate: string, reason: string): AutoDecisionResult {
      gateLog.push({ gate, outcome: "ROUTE_TO_HUMAN", reason });
      return { decision: "ROUTE_TO_HUMAN", gateLog, reason };
    }

    // ── Gate 1: Life active on service date ───────────────────
    if (pa.member.status !== "ACTIVE") {
      return failGate("ELIGIBILITY_ACTIVE", `Member status is ${pa.member.status}, not ACTIVE`);
    }
    if (pa.member.coverEndDate && serviceDate > pa.member.coverEndDate) {
      return failGate("ELIGIBILITY_COVER_END", `Service date ${serviceDate.toDateString()} is after cover end`);
    }
    pass("ELIGIBILITY_ACTIVE");

    // ── Gate 2: Provider eligible under the member's package ──
    const procedures = pa.procedures as Array<{ code: string }>;
    const procedureCodes = procedures.map((p) => p.code);

    // Check PackageProviderEligibility rules (D-02)
    const member = await prisma.member.findUnique({
      where: { id: pa.memberId },
      select: { packageVersionId: true },
    });
    if (member?.packageVersionId) {
      const eligibilityRules = await prisma.packageProviderEligibility.findMany({
        where: { packageVersionId: member.packageVersionId },
        select: { providerId: true, providerTier: true, inclusionType: true },
      });
      if (eligibilityRules.length > 0) {
        // Separate INCLUDE and EXCLUDE rules
        const includeRules = eligibilityRules.filter((r) => r.inclusionType === "INCLUDE");
        const excludeRules = eligibilityRules.filter((r) => r.inclusionType === "EXCLUDE");

        // Hard exclusion: provider explicitly excluded by ID or tier
        const isExcluded = excludeRules.some(
          (r) => r.providerId === pa.providerId ||
                 (r.providerTier && r.providerTier === pa.provider.tier),
        );
        if (isExcluded) {
          return failGate("PROVIDER_ELIGIBILITY", `Provider is excluded under this package's eligibility rules`);
        }

        // Whitelist mode: include rules present — provider must be in the list
        if (includeRules.length > 0) {
          const isIncluded = includeRules.some(
            (r) => r.providerId === pa.providerId ||
                   (r.providerTier && r.providerTier === pa.provider.tier),
          );
          if (!isIncluded) {
            return routeHuman("PROVIDER_ELIGIBILITY", `Provider not in package's approved provider list — routing for manual review`);
          }
        }
      }
    }
    pass("PROCEDURE_COVERED");

    // ── Gate 3: Diagnosis not on exclusion list ────────────────
    const diagnoses = pa.diagnoses as Array<{ code: string }>;
    if (diagnoses.length > 0) {
      const diagnosisCodes = diagnoses.map((d) => d.code);
      const exclusions = await prisma.membershipExclusion.findMany({
        where: {
          tenantId,
          memberId: pa.memberId,
          isActive: true,
          icd10Code: { in: diagnosisCodes },
        },
      });
      if (exclusions.length > 0) {
        return failGate("EXCLUSION_CHECK",
          `Diagnosis ${exclusions.map((e) => e.icd10Code).join(", ")} excluded under underwriting decision`);
      }
    }
    pass("EXCLUSION_CHECK");

    // ── Gate 4: Waiting period elapsed ────────────────────────
    const waitingPeriods = await prisma.waitingPeriodApplication.findMany({
      where: {
        tenantId,
        memberId: pa.memberId,
        isActive: true,
        endDate: { gt: serviceDate },
        benefitCategories: { has: pa.benefitCategory },
      },
    });
    if (waitingPeriods.length > 0) {
      const earliest = waitingPeriods.sort((a, b) => b.endDate.getTime() - a.endDate.getTime())[0];
      return failGate("WAITING_PERIOD",
        `Waiting period for ${pa.benefitCategory} ends ${earliest.endDate.toDateString()}`);
    }
    pass("WAITING_PERIOD");

    // ── Gate 5: Cost within remaining cap ─────────────────────
    // PR-011 #4: the check is scoped to the benefit config for the PA's
    // category (the previous "latest usage row, any category" read could gate
    // against the wrong benefit) and computes limit − used − held.
    const balance = await BenefitUsageService.availableLimit(prisma, pa.memberId, pa.benefitCategory);
    if (balance) {
      if (estimatedCost > balance.available) {
        return routeHuman("BENEFIT_CAP",
          `Estimated cost KES ${estimatedCost.toLocaleString()} exceeds remaining cap KES ${balance.available.toLocaleString()} (used ${balance.used.toLocaleString()} + held ${balance.held.toLocaleString()})`);
      }
    }
    pass("BENEFIT_CAP");

    // ── Gate 6: Auto-approve ceiling ──────────────────────────
    if (estimatedCost > AUTO_APPROVE_CEILING_KES) {
      return routeHuman("AUTO_APPROVE_CEILING",
        `Estimated cost KES ${estimatedCost.toLocaleString()} exceeds auto-approve ceiling KES ${AUTO_APPROVE_CEILING_KES.toLocaleString()}`);
    }
    pass("AUTO_APPROVE_CEILING");

    // ── Gate 7: Procedure on auto-approve / never-auto list ───
    const hasNeverAuto = procedureCodes.some((c) => NEVER_AUTO_PROCEDURE_CODES.has(c));
    if (hasNeverAuto) {
      return routeHuman("PROCEDURE_NEVER_AUTO",
        `Procedure ${procedureCodes.find((c) => NEVER_AUTO_PROCEDURE_CODES.has(c))} requires clinical review`);
    }
    pass("PROCEDURE_NEVER_AUTO");

    // ── Gate 8: Fraud screening ────────────────────────────────
    // ClaimFraudAlert links via claimId, not memberId — look up through member's recent claims
    const recentClaims = await prisma.claim.findMany({
      where: {
        tenantId,
        memberId: pa.memberId,
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
      take: 20,
    });
    if (recentClaims.length > 0) {
      const fraudAlerts = await prisma.claimFraudAlert.findMany({
        where: {
          tenantId,
          claimId: { in: recentClaims.map((c) => c.id) },
          severity: "HIGH",
          resolved: false,
        },
        take: 1,
      });
      if (fraudAlerts.length > 0) {
        return routeHuman("FRAUD_SCREENING", `High-severity fraud alert on recent claim — routing for manual review`);
      }
    }
    pass("FRAUD_SCREENING");

    // ── Gate 9: Provider network status ───────────────────────
    if (pa.provider.contractStatus !== "ACTIVE") {
      return failGate("PROVIDER_NETWORK", `Provider contract status is ${pa.provider.contractStatus}`);
    }
    pass("PROVIDER_NETWORK");

    // ── Gate 9.5: Practitioner credential check (D-06) ────────
    // Check that the provider has at least one active practitioner
    // with a valid, non-expired credential. If all are expired, route to human.
    const today = new Date();
    const providerPractitioners = await prisma.providerPractitioner.findMany({
      where: { providerId: pa.providerId },
      include: {
        practitioner: {
          include: {
            credentials: {
              where: { status: "ACTIVE", expiryDate: { gt: today } },
              take: 1,
            },
          },
        },
      },
      take: 10,
    });
    if (providerPractitioners.length > 0) {
      const hasValidCredential = providerPractitioners.some(
        (pp) => pp.practitioner.credentials.length > 0
      );
      if (!hasValidCredential) {
        return routeHuman("PRACTITIONER_CREDENTIAL",
          `No practitioner at ${pa.provider.name} has a current valid credential — manual review required`);
      }
    }
    pass("PRACTITIONER_CREDENTIAL");

    const elapsed = Date.now() - startMs;
    if (elapsed > 3000) {
      console.warn(`[preauth-auto-decision] Took ${elapsed}ms — target is <3000ms`);
    }

    return { decision: "AUTO_APPROVED", gateLog };
  },

  // ── 2. Execute auto-decision ──────────────────────────────────────────────

  async executeAutoDecision(preAuthId: string, tenantId: string, actorId = "system") {
    const result = await preauthAdjudicationService.runAutoDecision(preAuthId, tenantId);
    const pa     = await prisma.preAuthorization.findUnique({ where: { id: preAuthId } });
    if (!pa) throw new TRPCError({ code: "NOT_FOUND", message: "PA not found" });

    if (result.decision === "AUTO_APPROVED") {
      const validUntil = new Date(Date.now() + PA_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
      // Issue a Guarantee of Payment (G5.5): approvedAmount is already capped to
      // the member's available benefit limit by the gates, so the GOP is
      // guaranteed within financial limits.
      const gopCount = await prisma.preAuthorization.count({ where: { tenantId, gopNumber: { not: null } } });
      const gopNumber = `GOP-${new Date().getFullYear()}-${String(gopCount + 1).padStart(5, "0")}`;

      await prisma.$transaction([
        prisma.preAuthorization.update({
          where: { id: preAuthId },
          data: {
            status:         "APPROVED",
            approvedAmount: pa.estimatedCost,
            approvedAt:     new Date(),
            approvedBy:     "AUTO",
            validFrom:      new Date(),
            validUntil,
            gopNumber,
            gopIssuedAt:    new Date(),
            autoDecisionLog: result.gateLog as never,
          },
        }),
      ]);

      // Create benefit hold
      await preauthAdjudicationService.createBenefitHold(
        preAuthId, tenantId, pa.memberId,
        String(pa.benefitCategory),
        Number(pa.estimatedCost),
        validUntil,
      );

    } else if (result.decision === "AUTO_DECLINED") {
      await prisma.preAuthorization.update({
        where: { id: preAuthId },
        data: {
          status:           "DECLINED",
          declineReasonCode: "AUTO_DECLINED",
          declineNotes:      result.reason,
          declinedAt:        new Date(),
          declinedBy:        "AUTO",
          autoDecisionLog:   result.gateLog as never,
        },
      });

    } else {
      // ROUTE_TO_HUMAN — enrich with gate log and set SLA
      const slaType     = pa.isEmergency ? "EMERGENCY" : pa.serviceType === "INPATIENT" ? "INPATIENT_PREADMISSION" : "OUTPATIENT";
      const slaDeadline = preauthAdjudicationService.getSlaDeadline(slaType, pa.isEmergency);

      await prisma.preAuthorization.update({
        where: { id: preAuthId },
        data: {
          status:         "UNDER_REVIEW",
          slaType,
          slaDeadlineAt:  slaDeadline,
          autoDecisionLog: result.gateLog as never,
        },
      });
    }

    await auditChainService.append({
      actorId,
      action:     `PREAUTH:${result.decision}`,
      module:     "PREAUTH",
      entityType: "PreAuthorization",
      entityId:   preAuthId,
      payload:    { decision: result.decision, gateLog: result.gateLog },
      tenantId,
      description: `PA ${pa.preauthNumber} auto-decision: ${result.decision}`,
    });

    return result;
  },

  // ── 3. Benefit hold management ────────────────────────────────────────────

  /**
   * PR-011: every PA approval places exactly one hold. The BenefitUsage row is
   * **upserted** and scoped to the benefit config for the PA's category (the
   * previous `updateMany` no-opped for members without a row and was unscoped
   * by benefit config).
   */
  async createBenefitHold(
    preAuthId: string,
    tenantId: string,
    memberId: string,
    benefitCategory: string,
    heldAmount: number,
    expiresAt: Date,
  ) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.benefitHold.findUnique({ where: { preAuthId } });
      // If an ACTIVE hold already exists for this PA, adjust by the delta so a
      // re-approval never double-reserves.
      const previouslyHeld = existing && existing.status === "ACTIVE" ? Number(existing.heldAmount) : 0;

      await tx.benefitHold.upsert({
        where: { preAuthId },
        update: { heldAmount, expiresAt, status: "ACTIVE", releasedAt: null },
        create: { tenantId, memberId, preAuthId, benefitCategory, heldAmount, expiresAt },
      });

      const delta = heldAmount - previouslyHeld;
      if (delta > 0) {
        await BenefitUsageService.placeHold(tx, memberId, benefitCategory, delta);
      } else if (delta < 0) {
        await BenefitUsageService.releaseHold(tx, memberId, benefitCategory, -delta);
      }
    });
  },

  async releaseBenefitHold(preAuthId: string, tenantId: string) {
    const hold = await prisma.benefitHold.findUnique({ where: { preAuthId } });
    if (!hold || hold.status !== "ACTIVE") return;

    await prisma.$transaction(async (tx) => {
      await tx.benefitHold.update({
        where: { preAuthId },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
      await BenefitUsageService.releaseHold(tx, hold.memberId, hold.benefitCategory, Number(hold.heldAmount));
    });
  },

  // NOTE (W1.1): the legacy `convertHoldToClaim` (which set the retired
  // CONVERTED_TO_CLAIM status) is deleted. Hold conversion at claim decision
  // time is owned by ClaimDecisionService.decide.

  // ── 4. Release expired holds (called by preauth escalation job) ──────────

  /**
   * PR-011 #3: past validUntil the hold is released, `activeHoldAmount`
   * restored, and the unattached APPROVED PA is marked EXPIRED.
   */
  async releaseExpiredHolds(tenantId: string): Promise<number> {
    const expired = await prisma.benefitHold.findMany({
      where: { tenantId, status: "ACTIVE", expiresAt: { lt: new Date() } },
    });

    for (const hold of expired) {
      await preauthAdjudicationService.releaseBenefitHold(hold.preAuthId, tenantId);
      await prisma.preAuthorization.updateMany({
        where: { id: hold.preAuthId, status: "APPROVED", claimId: null },
        data: { status: "EXPIRED" },
      });
    }
    return expired.length;
  },

  // ── 5. SLA deadline calculation ───────────────────────────────────────────

  getSlaDeadline(slaType: string, isEmergency = false): Date {
    const minutes = isEmergency ? SLA_MINUTES.EMERGENCY : (SLA_MINUTES[slaType] ?? 120);
    return new Date(Date.now() + minutes * 60 * 1000);
  },

  // ── 6. Human review decision ──────────────────────────────────────────────

  /**
   * THE canonical human pre-auth approval (W1.1): status-guarded, always
   * places the benefit hold (PR-011), snapshots the remaining benefit, and
   * annotates any limit shortfall so the reviewer's decision is explainable.
   */
  async approveByHuman(
    preAuthId: string,
    tenantId: string,
    reviewerId: string,
    approvedAmount: number,
    notes?: string,
    validDays?: number,
  ) {
    const pa = await prisma.preAuthorization.findUnique({ where: { id: preAuthId, tenantId } });
    if (!pa) throw new TRPCError({ code: "NOT_FOUND", message: "PA not found" });
    if (!["SUBMITTED", "UNDER_REVIEW"].includes(pa.status)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Pre-authorization cannot be decided in its current status (${pa.status.replace(/_/g, " ")}).`,
      });
    }
    if (!(approvedAmount > 0)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Approved amount must be greater than zero." });
    }

    // PR-011 #2 (human path): show the shortfall when the approval exceeds the
    // member's available limit (limit − used − held).
    const balance = await BenefitUsageService.availableLimit(prisma, pa.memberId, pa.benefitCategory);
    let reviewNotes = notes;
    if (balance && approvedAmount > balance.available) {
      const short = `Limit shortfall: approved ${approvedAmount.toLocaleString()} vs available ${balance.available.toLocaleString()} (limit ${balance.limit.toLocaleString()} − used ${balance.used.toLocaleString()} − held ${balance.held.toLocaleString()}).`;
      reviewNotes = reviewNotes ? `${reviewNotes} ${short}` : short;
    }

    const validUntil = new Date(Date.now() + (validDays ?? PA_VALIDITY_DAYS) * 24 * 60 * 60 * 1000);
    // Issue the GOP on manual approval too (G5.5), within the guaranteed amount.
    const gopCount = await prisma.preAuthorization.count({ where: { tenantId, gopNumber: { not: null } } });
    const gopNumber = `GOP-${new Date().getFullYear()}-${String(gopCount + 1).padStart(5, "0")}`;

    await prisma.preAuthorization.update({
      where: { id: preAuthId },
      data: {
        status:         "APPROVED",
        approvedAmount,
        approvedAt:     new Date(),
        approvedBy:     reviewerId,
        validFrom:      new Date(),
        validUntil,
        gopNumber,
        gopIssuedAt:    new Date(),
        benefitRemaining: balance ? Math.max(0, balance.available - approvedAmount) : null,
        reviewNotes,
      } as never,
    });

    await preauthAdjudicationService.createBenefitHold(
      preAuthId, tenantId, pa.memberId,
      String(pa.benefitCategory), approvedAmount, validUntil,
    );

    await auditChainService.append({
      actorId:    reviewerId,
      action:     "PREAUTH:HUMAN_APPROVED",
      module:     "PREAUTH",
      entityType: "PreAuthorization",
      entityId:   preAuthId,
      payload:    { approvedAmount, reviewerId },
      tenantId,
      description: `PA ${pa.preauthNumber} approved by human reviewer KES ${approvedAmount.toLocaleString()}`,
    });
  },

  async declineByHuman(
    preAuthId: string,
    tenantId: string,
    reviewerId: string,
    reasonCode: string,
    notes: string,
  ) {
    const pa = await prisma.preAuthorization.findUnique({ where: { id: preAuthId, tenantId } });
    if (!pa) throw new TRPCError({ code: "NOT_FOUND", message: "PA not found" });
    if (!["SUBMITTED", "UNDER_REVIEW"].includes(pa.status)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Pre-authorization cannot be decided in its current status (${pa.status.replace(/_/g, " ")}).`,
      });
    }

    await prisma.preAuthorization.update({
      where: { id: preAuthId },
      data: {
        status:           "DECLINED",
        declineReasonCode: reasonCode,
        declineNotes:      notes,
        declinedAt:        new Date(),
        declinedBy:        reviewerId,
      },
    });

    await auditChainService.append({
      actorId:    reviewerId,
      action:     "PREAUTH:HUMAN_DECLINED",
      module:     "PREAUTH",
      entityType: "PreAuthorization",
      entityId:   preAuthId,
      payload:    { reasonCode, notes },
      tenantId,
      description: `PA ${pa.preauthNumber} declined: ${reasonCode}`,
    });
  },

  // ── 7. Mid-treatment PA amendment ────────────────────────────────────────

  async createPaAmendment(
    parentPreAuthId: string,
    tenantId: string,
    requestedById: string,
    additionalData: {
      additionalCost: number;
      additionalProcedures: Array<{ code: string; description: string }>;
      clinicalNotes?: string;
    },
  ) {
    const parent = await prisma.preAuthorization.findUnique({
      where: { id: parentPreAuthId, tenantId },
    });
    if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Parent PA not found" });
    if (parent.status !== "APPROVED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Can only amend an APPROVED pre-authorization" });
    }

    const count = await prisma.preAuthorization.count({ where: { tenantId } });
    const preauthNumber = `PA-AMD-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    const amendment = await prisma.preAuthorization.create({
      data: {
        tenantId,
        preauthNumber,
        memberId:     parent.memberId,
        providerId:   parent.providerId,
        submittedBy:  requestedById,
        status:       "SUBMITTED",
        diagnoses:    (parent.diagnoses ?? []) as never,
        procedures:   additionalData.additionalProcedures as never,
        estimatedCost: additionalData.additionalCost,
        clinicalNotes: additionalData.clinicalNotes,
        serviceType:   parent.serviceType,
        benefitCategory: parent.benefitCategory,
        parentPreAuthId,
        isEmergency:   parent.isEmergency,
      },
    });

    return amendment;
  },

  // ── 8. Cancel a PA and release hold ──────────────────────────────────────

  async cancelPreAuth(preAuthId: string, tenantId: string, actorId: string, reason: string) {
    const existing = await prisma.preAuthorization.findUnique({
      where: { id: preAuthId, tenantId },
      select: { status: true },
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "PA not found" });
    if (["UTILISED", "CONVERTED_TO_CLAIM", "CANCELLED"].includes(existing.status)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `A ${existing.status.replace(/_/g, " ")} pre-authorization cannot be cancelled.`,
      });
    }

    // Hold released in the same operation (PR-011 #3: cancel ⇒ release).
    await preauthAdjudicationService.releaseBenefitHold(preAuthId, tenantId);

    await prisma.preAuthorization.update({
      where: { id: preAuthId, tenantId },
      data: { status: "CANCELLED" },
    });

    const pa = await prisma.preAuthorization.findUnique({ where: { id: preAuthId } });
    await auditChainService.append({
      actorId,
      action:     "PREAUTH:CANCELLED",
      module:     "PREAUTH",
      entityType: "PreAuthorization",
      entityId:   preAuthId,
      payload:    { reason },
      tenantId,
      description: `PA ${pa?.preauthNumber ?? preAuthId} cancelled: ${reason}`,
    });
  },

  // ── 9. Query enriched PA detail ───────────────────────────────────────────

  async getEnrichedDetail(preAuthId: string, tenantId: string) {
    const [pa, hold] = await Promise.all([
      prisma.preAuthorization.findUnique({
        where: { id: preAuthId, tenantId },
        include: {
          member:   { select: { id: true, firstName: true, lastName: true, memberNumber: true, status: true } },
          provider: { select: { id: true, name: true, type: true, tier: true } },
          claim:    { select: { id: true, claimNumber: true } },
        },
      }),
      prisma.benefitHold.findUnique({ where: { preAuthId } }),
    ]);

    if (!pa) return null;

    // Compute current benefit balance for the member
    const usage = await prisma.benefitUsage.findFirst({
      where: {
        memberId:    pa.memberId,
        periodStart: { lte: new Date() },
        periodEnd:   { gte: new Date() },
      },
      include: { benefitConfig: { select: { annualSubLimit: true, category: true } } },
    });

    return {
      ...pa,
      hold,
      benefitBalance: usage ? {
        limit:     Number(usage.benefitConfig?.annualSubLimit ?? 0),
        used:      Number(usage.amountUsed),
        held:      Number(usage.activeHoldAmount),
        remaining: Number(usage.benefitConfig?.annualSubLimit ?? 0)
                   - Number(usage.amountUsed)
                   - Number(usage.activeHoldAmount),
        category:  usage.benefitConfig?.category,
      } : null,
    };
  },
};
