import { prisma } from "@/lib/prisma";

// ── Tunable thresholds ─────────────────────────────────────────────────────────
const CONFIG = {
  /** KES — unlinked claim above this triggers HIGH alert */
  highValueNoPreAuthThreshold: 150_000,
  /** Number of claims within the velocity window that triggers MEDIUM alert */
  velocityClaimCount: 3,
  /** Days for visit velocity window */
  velocityWindowDays: 14,
  /** Outpatient hour range (EAT) considered after-hours */
  afterHoursStart: 0,
  afterHoursEnd: 5,
  /** Seconds — service date this far in future flags RULE-TEMP-002 */
  futureDateMaxHours: 24,
  /** Fraction over tariff that triggers RULE-BILL-003 (0.15 = 15%) */
  tariffBreachFraction: 0.15,
  /** KES — amounts that are multiples of this trigger RULE-BILL-004 */
  roundNumberGranularity: 1_000,
  /** Minimum number of round-numbered lines to flag RULE-BILL-004 */
  roundNumberLineThreshold: 3,
  /** Days within which a near-duplicate claim triggers RULE-TEMP-004 */
  duplicateWindowDays: 3,
  /** Fraction similarity — billed amount within this of an existing claim */
  duplicateAmountFraction: 0.05,
  /** Days — multiple claims on same day + same provider triggers RULE-FIN-004 */
  splitBillWindowHours: 24,
  /** Number of same-day claims at same provider to flag split-billing */
  splitBillClaimCount: 2,
  /** Days — recent pre-auth count window */
  preauthVelocityWindowDays: 30,
  /** Max pre-auths in window before soft warning on new submission */
  preauthVelocityCount: 4,
  /** Days — group enrollment burst window for enrollment risk */
  enrollmentBurstWindowDays: 30,
  /** Max new members in a group within the window before warning */
  enrollmentBurstCount: 8,
};

// ── Gender-coded procedures (CPT codes exclusively for one sex) ────────────────
// "F" = should only appear on female members, "M" = male only
const GENDER_CODED_PROCEDURES: Record<string, "F" | "M"> = {
  // Female-only
  "58150": "F", // Hysterectomy
  "58600": "F", // Tubal ligation
  "58661": "F", // Laparoscopic salpingo-oophorectomy
  "59400": "F", // Obstetric care
  "59510": "F", // Cesarean delivery
  "76805": "F", // Obstetric ultrasound
  "88141": "F", // Pap smear
  "77067": "F", // Bilateral screening mammography
  // Male-only
  "55250": "M", // Vasectomy
  "55700": "M", // Prostate biopsy
  "52601": "M", // Transurethral prostatectomy
};

type AlertPayload = {
  tenantId: string;
  claimId: string;
  rule: string;
  score: number;
  severity: "HIGH" | "MEDIUM" | "LOW" | "CRITICAL";
  notes: string;
};

export class FraudService {
  // ── CLAIM EVALUATION (called synchronously in createClaimAction) ────────────

  /**
   * Evaluates an incoming claim across all heuristic rules.
   * Creates ClaimFraudAlert records for each triggered rule.
   */
  static async evaluateClaim(claimId: string, tenantId: string) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        claimLines: true,
        member: {
          include: {
            claims: {
              where: {
                receivedAt: {
                  gte: new Date(
                    Date.now() - CONFIG.velocityWindowDays * 24 * 60 * 60 * 1000
                  ),
                },
              },
              select: { id: true },
            },
          },
        },
      },
    });

    if (!claim) return;

    const newAlerts: AlertPayload[] = [];

    // ── RULE-GATE-001: Unlinked High-Value Claim ──────────────────────────────
    if (
      !claim.preauthId &&
      Number(claim.billedAmount) > CONFIG.highValueNoPreAuthThreshold
    ) {
      newAlerts.push({
        tenantId,
        claimId,
        rule: "High Value Without Pre-Authorization",
        score: 85,
        severity: "HIGH",
        notes: `Claim billed at KES ${Number(claim.billedAmount).toLocaleString()} without a linked Pre-Authorization.`,
      });
    }

    // ── RULE-VEL-001: Visit Velocity ─────────────────────────────────────────
    if (claim.member.claims.length > CONFIG.velocityClaimCount) {
      newAlerts.push({
        tenantId,
        claimId,
        rule: "Suspicious Visit Velocity",
        score: 70,
        severity: "MEDIUM",
        notes: `Member has ${claim.member.claims.length} claims in the last ${CONFIG.velocityWindowDays} days (threshold: ${CONFIG.velocityClaimCount}).`,
      });
    }

    // ── RULE-TEMP-003: After-Hours Outpatient Anomaly ─────────────────────────
    if (claim.serviceType === "OUTPATIENT" && claim.dateOfService) {
      const eat = new Date(claim.dateOfService.getTime() + 3 * 60 * 60 * 1000);
      const hour = eat.getUTCHours();
      if (hour >= CONFIG.afterHoursStart && hour < CONFIG.afterHoursEnd) {
        newAlerts.push({
          tenantId,
          claimId,
          rule: "After-Hours Outpatient Anomaly",
          score: 60,
          severity: "MEDIUM",
          notes: `Outpatient service recorded at ${eat.toISOString().slice(11, 16)} EAT — unusual for non-emergency outpatient processing.`,
        });
      }
    }

    // ── RULE-TEMP-001: Discharge Before Admission ─────────────────────────────
    if (claim.serviceType === "INPATIENT" && claim.dateOfService && claim.dischargeDate) {
      if (claim.dischargeDate < claim.dateOfService) {
        newAlerts.push({
          tenantId,
          claimId,
          rule: "Discharge Date Before Admission Date",
          score: 95,
          severity: "CRITICAL",
          notes: `Discharge (${claim.dischargeDate.toISOString().slice(0, 10)}) is before admission (${claim.dateOfService.toISOString().slice(0, 10)}).`,
        });
      }
    }

    // ── RULE-TEMP-002: Future-Dated Service ───────────────────────────────────
    if (claim.dateOfService) {
      const maxFuture = new Date(
        Date.now() + CONFIG.futureDateMaxHours * 60 * 60 * 1000
      );
      if (claim.dateOfService > maxFuture) {
        newAlerts.push({
          tenantId,
          claimId,
          rule: "Future-Dated Service",
          score: 80,
          severity: "HIGH",
          notes: `Date of service (${claim.dateOfService.toISOString().slice(0, 10)}) is in the future.`,
        });
      }
    }

    // ── RULE-TEMP-004: Duplicate Claim ───────────────────────────────────────
    if (claim.dateOfService) {
      const windowStart = new Date(
        claim.dateOfService.getTime() -
          CONFIG.duplicateWindowDays * 24 * 60 * 60 * 1000
      );
      const windowEnd = new Date(
        claim.dateOfService.getTime() +
          CONFIG.duplicateWindowDays * 24 * 60 * 60 * 1000
      );
      const nearDuplicates = await prisma.claim.findMany({
        where: {
          id: { not: claimId },
          memberId: claim.memberId,
          providerId: claim.providerId,
          dateOfService: { gte: windowStart, lte: windowEnd },
        },
        select: { id: true, billedAmount: true, claimNumber: true },
      });

      const billed = Number(claim.billedAmount);
      const tolerance = billed * CONFIG.duplicateAmountFraction;
      const truedup = nearDuplicates.find(
        (d) => Math.abs(Number(d.billedAmount) - billed) <= tolerance
      );
      if (truedup) {
        newAlerts.push({
          tenantId,
          claimId,
          rule: "Probable Duplicate Claim",
          score: 90,
          severity: "HIGH",
          notes: `Near-identical claim ${truedup.claimNumber} exists for same member, provider and service date (±${CONFIG.duplicateWindowDays} days, ±${CONFIG.duplicateAmountFraction * 100}% amount).`,
        });
      }
    }

    // ── RULE-BILL-003: Amount Exceeds Contracted Tariff ──────────────────────
    if (claim.claimLines.length > 0) {
      for (const line of claim.claimLines) {
        if (!line.cptCode) continue;
        const tariff = await prisma.providerTariff.findFirst({
          where: {
            providerId: claim.providerId,
            cptCode: line.cptCode,
            effectiveFrom: { lte: claim.dateOfService ?? new Date() },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: claim.dateOfService ?? new Date() } },
            ],
          },
          select: { agreedRate: true },
        });
        if (tariff) {
          const agreed = Number(tariff.agreedRate);
          const billed = Number(line.billedAmount);
          if (billed > agreed * (1 + CONFIG.tariffBreachFraction)) {
            const pct = Math.round(((billed - agreed) / agreed) * 100);
            newAlerts.push({
              tenantId,
              claimId,
              rule: "Billed Amount Exceeds Contracted Tariff",
              score: 75,
              severity: "HIGH",
              notes: `Line ${line.lineNumber} (CPT ${line.cptCode}): billed KES ${billed.toLocaleString()} vs agreed KES ${agreed.toLocaleString()} — ${pct}% over tariff.`,
            });
            break; // one alert per claim is enough
          }
        }
      }
    }

    // ── RULE-BILL-004: Round-Number Line Clustering ───────────────────────────
    if (claim.claimLines.length >= CONFIG.roundNumberLineThreshold) {
      const roundedLines = claim.claimLines.filter(
        (l) => Number(l.billedAmount) % CONFIG.roundNumberGranularity === 0
      );
      if (roundedLines.length >= CONFIG.roundNumberLineThreshold) {
        newAlerts.push({
          tenantId,
          claimId,
          rule: "Round-Number Billing Pattern",
          score: 55,
          severity: "MEDIUM",
          notes: `${roundedLines.length} of ${claim.claimLines.length} claim lines are billed at exact KES ${CONFIG.roundNumberGranularity.toLocaleString()} multiples — may indicate estimated rather than actual charges.`,
        });
      }
    }

    // ── RULE-CLIN-001: Gender-Procedure Mismatch ─────────────────────────────
    const memberGender = claim.member.gender;
    for (const line of claim.claimLines) {
      if (!line.cptCode) continue;
      const coded = GENDER_CODED_PROCEDURES[line.cptCode];
      if (!coded) continue;
      const mismatch =
        (coded === "F" && memberGender === "MALE") ||
        (coded === "M" && memberGender === "FEMALE");
      if (mismatch) {
        newAlerts.push({
          tenantId,
          claimId,
          rule: "Gender-Procedure Mismatch",
          score: 98,
          severity: "CRITICAL",
          notes: `CPT ${line.cptCode} (${coded === "F" ? "female-only" : "male-only"} procedure) billed on a ${memberGender} member.`,
        });
        break;
      }
    }

    // ── RULE-FIN-004: Split Billing ───────────────────────────────────────────
    if (claim.dateOfService && claim.serviceType === "OUTPATIENT") {
      const dayStart = new Date(claim.dateOfService);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const sameDayClaims = await prisma.claim.count({
        where: {
          id: { not: claimId },
          memberId: claim.memberId,
          providerId: claim.providerId,
          dateOfService: { gte: dayStart, lt: dayEnd },
        },
      });
      if (sameDayClaims >= CONFIG.splitBillClaimCount) {
        newAlerts.push({
          tenantId,
          claimId,
          rule: "Probable Split Billing",
          score: 72,
          severity: "MEDIUM",
          notes: `${sameDayClaims + 1} claims submitted for the same member, provider, and service date — may be artificially split to avoid a single high-value review.`,
        });
      }
    }

    if (newAlerts.length > 0) {
      await prisma.claimFraudAlert.createMany({ data: newAlerts });
    }
  }

  // ── PRE-AUTH EVALUATION (called in ClaimsService.createPreAuth) ────────────

  /**
   * Screens a pre-authorisation request before it is persisted.
   * - CRITICAL rules throw an Error (block submission).
   * - All other triggered rules are returned as a string[] of warnings
   *   that the caller surfaces inline in the form without blocking.
   */
  static async evaluatePreAuth(params: {
    memberId: string;
    providerId: string;
    serviceType: string;
    expectedDateOfService?: Date;
    estimatedCost: number;
    procedures: Array<{ description?: string; cptCode?: string }>;
    memberGender: "MALE" | "FEMALE" | "OTHER";
    tenantId: string;
  }): Promise<string[]> {
    const warnings: string[] = [];

    // ── CLIN-001: Gender-procedure mismatch (CRITICAL — block) ───────────────
    for (const proc of params.procedures) {
      const cpt = proc.cptCode;
      if (!cpt) continue;
      const coded = GENDER_CODED_PROCEDURES[cpt];
      if (!coded) continue;
      const mismatch =
        (coded === "F" && params.memberGender === "MALE") ||
        (coded === "M" && params.memberGender === "FEMALE");
      if (mismatch) {
        throw new Error(
          `Pre-authorization blocked: CPT ${cpt} is a ${coded === "F" ? "female-only" : "male-only"} procedure but the member is recorded as ${params.memberGender}. Please verify the CPT code.`
        );
      }
    }

    // ── TEMP-002: Future-dated service beyond 7 days (warn) ──────────────────
    if (params.expectedDateOfService) {
      const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      if (params.expectedDateOfService > sevenDays) {
        warnings.push(
          `Expected date of service (${params.expectedDateOfService.toISOString().slice(0, 10)}) is more than 7 days away — confirm scheduling is correct.`
        );
      }
    }

    // ── BILL-003: Estimated cost vs tariff (warn if >15% over) ───────────────
    for (const proc of params.procedures) {
      if (!proc.cptCode) continue;
      const tariff = await prisma.providerTariff.findFirst({
        where: {
          providerId: params.providerId,
          cptCode: proc.cptCode,
          effectiveFrom: { lte: params.expectedDateOfService ?? new Date() },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: params.expectedDateOfService ?? new Date() } },
          ],
        },
        select: { agreedRate: true },
      });
      if (tariff) {
        const agreed = Number(tariff.agreedRate);
        if (params.estimatedCost > agreed * (1 + CONFIG.tariffBreachFraction)) {
          const pct = Math.round(
            ((params.estimatedCost - agreed) / agreed) * 100
          );
          warnings.push(
            `Estimated cost (KES ${params.estimatedCost.toLocaleString()}) is ${pct}% above the contracted tariff for CPT ${proc.cptCode} (KES ${agreed.toLocaleString()}).`
          );
        }
      }
    }

    // ── VEL-002: Pre-auth velocity (warn) ────────────────────────────────────
    const windowStart = new Date(
      Date.now() -
        CONFIG.preauthVelocityWindowDays * 24 * 60 * 60 * 1000
    );
    const recentCount = await prisma.preAuthorization.count({
      where: {
        memberId: params.memberId,
        createdAt: { gte: windowStart },
      },
    });
    if (recentCount >= CONFIG.preauthVelocityCount) {
      warnings.push(
        `Member already has ${recentCount} pre-authorisations in the last ${CONFIG.preauthVelocityWindowDays} days — review for potential overutilisation.`
      );
    }

    return warnings;
  }

  // ── ENROLLMENT RISK CHECK (called in MembersService.createMember) ──────────

  /**
   * Soft-check on new member enrollment.
   * Never throws — returns string[] of advisory warnings surfaced in the form.
   * Hard duplicate blocks (ID, phone, name+DOB) remain in MembersService.
   */
  static async checkEnrollmentRisk(params: {
    groupId: string;
    tenantId: string;
    dateOfBirth: Date;
    relationship?: string;
  }): Promise<string[]> {
    const warnings: string[] = [];

    // ── Enrollment burst — many new members in same group recently ────────────
    const burstWindow = new Date(
      Date.now() -
        CONFIG.enrollmentBurstWindowDays * 24 * 60 * 60 * 1000
    );
    const recentEnrollments = await prisma.member.count({
      where: {
        groupId: params.groupId,
        createdAt: { gte: burstWindow },
      },
    });
    if (recentEnrollments >= CONFIG.enrollmentBurstCount) {
      warnings.push(
        `This group has enrolled ${recentEnrollments} members in the last ${CONFIG.enrollmentBurstWindowDays} days — verify this is a legitimate batch addition and not a fraudulent enrollment burst.`
      );
    }

    // ── Minor enrolled as principal ──────────────────────────────────────────
    if (params.relationship === "PRINCIPAL" || !params.relationship) {
      const ageMs = Date.now() - params.dateOfBirth.getTime();
      const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
      if (ageYears < 18) {
        warnings.push(
          `Member's date of birth indicates age ${Math.floor(ageYears)} — enrolling a minor as the Principal member is unusual. Confirm the relationship and date of birth are correct.`
        );
      }
    }

    return warnings;
  }

  // ── CO-CONTRIBUTION FRAUD RULES (called post-adjudication) ────────────────

  static async evaluateCoContribution(params: {
    claimId: string;
    tenantId: string;
    memberId: string;
    finalAmount: number;
    collectionStatus: string;
    waiverReason?: string | null;
    waiverApprovedBy?: string | null;
  }): Promise<string[]> {
    const warnings: string[] = [];

    // RULE-COC-001: Waiver without documented reason
    if (
      params.collectionStatus === "WAIVED" &&
      (!params.waiverReason || params.waiverReason.trim().length < 10)
    ) {
      warnings.push(
        "RULE-COC-001: Co-contribution waived without adequate documented reason — ensure a supervisor has reviewed and approved."
      );
    }

    // RULE-COC-002: Repeated waivers for the same member
    const recentWaivers = await prisma.coContributionTransaction.count({
      where: {
        memberId: params.memberId,
        collectionStatus: "WAIVED",
        NOT: { claimId: params.claimId },
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
    });
    if (recentWaivers >= 2) {
      warnings.push(
        `RULE-COC-002: Member has had ${recentWaivers} co-contribution waivers in the last 90 days — review for systematic waiver abuse.`
      );
    }

    // RULE-COC-003: Amount collected exceeds calculated final amount
    const tx = await prisma.coContributionTransaction.findUnique({
      where: { claimId: params.claimId },
    });
    if (tx) {
      const collected = Number(tx.amountCollected ?? 0);
      const final = Number(tx.finalAmount);
      if (collected > final * 1.01) {
        warnings.push(
          `RULE-COC-003: Amount collected (${collected.toFixed(2)}) exceeds calculated co-contribution (${final.toFixed(2)}) — verify for overcharging.`
        );
      }
    }

    // RULE-COC-004: Zero co-contribution on a high-value claim without waiver
    if (params.finalAmount === 0 && params.collectionStatus !== "WAIVED") {
      const claim = await prisma.claim.findUnique({
        where: { id: params.claimId },
        select: { billedAmount: true },
      });
      if (claim && Number(claim.billedAmount) > 50_000) {
        warnings.push(
          "RULE-COC-004: Zero co-contribution applied on a claim exceeding KES 50,000 — confirm a NONE-type rule is intentional for this benefit category and network tier."
        );
      }
    }

    // RULE-COC-005: Annual cap reached suspiciously early (before Q3)
    if (params.collectionStatus !== "WAIVED") {
      const yearStart = new Date(new Date().getFullYear(), 0, 1);
      const q3Start = new Date(new Date().getFullYear(), 6, 1);
      const memberCap = await prisma.memberAnnualCoContribution.findFirst({
        where: {
          memberId: params.memberId,
          capReached: true,
          updatedAt: { gte: yearStart, lt: q3Start },
        },
      });
      if (memberCap) {
        warnings.push(
          "RULE-COC-005: Member's annual co-contribution cap was reached before Q3 — review for potential benefit overuse or rule misconfiguration."
        );
      }
    }

    // RULE-COC-006: Waiver approved by same user who submitted the claim
    // (uses memberId as a proxy since Claim has no createdBy field)
    if (params.collectionStatus === "WAIVED" && params.waiverApprovedBy) {
      const coTx = await prisma.coContributionTransaction.findUnique({
        where: { claimId: params.claimId },
        select: { waiverApprovedBy: true },
      });
      if (coTx?.waiverApprovedBy === params.memberId) {
        warnings.push(
          "RULE-COC-006: Co-contribution waiver approver matches the member ID on this claim — segregation of duties review recommended."
        );
      }
    }

    return warnings;
  }
}
