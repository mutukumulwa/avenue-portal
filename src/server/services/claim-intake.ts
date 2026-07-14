import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { FraudService } from "@/server/services/fraud.service";
import { AutoAdjudicationService } from "@/server/services/auto-adjudication.service";
import { ClaimsService } from "@/server/services/claims.service";
import { ProvidersService } from "@/server/services/providers.service";
import { MemberNotificationService } from "@/server/services/member-notification.service";
import { assertServiceDateNotFuture } from "@/lib/service-date";
import type { ServiceType, BenefitCategory, ClaimLineCategory } from "@prisma/client";

export interface IntakeLineItem {
  serviceCategory: ClaimLineCategory;
  cptCode: string;
  description: string;
  icdCode: string;
  quantity: number;
  unitCost: number;
  billedAmount: number;
}

export interface IntakeDiagnosis {
  code: string;
  description: string;
  standardCharge: number | null;
  isPrimary: boolean;
}

export interface ClaimIntakeInput {
  memberId: string;
  providerId: string;
  providerBranchId?: string;
  serviceType: ServiceType;
  benefitCategory: BenefitCategory;
  dateOfService: string;
  admissionDate?: string;
  dischargeDate?: string;
  attendingDoctor?: string;
  diagnoses: IntakeDiagnosis[];
  lineItems: IntakeLineItem[];
}

/**
 * The single claim-intake path (PR-013/PR-006/PR-024). Every direct-entry
 * channel — the admin claim wizard AND the provider facility portal — funnels
 * through here so the same eligibility, provider-operational, benefit-in-package
 * and pre-auth gates, fraud evaluation and auto-adjudication run identically.
 * Callers own auth + redirect; this owns the business rules.
 */
export async function runClaimIntake(
  tenantId: string,
  actorUserId: string,
  data: ClaimIntakeInput,
) {
  // ── Line-amount positivity gate (BB2-DEF-01 defence in depth) ─────────────
  // No intake rail may materialise a non-positive or inconsistent line amount,
  // whatever the caller validated. This is the canonical intake path, so the
  // guard lives here in addition to any rail-specific validation.
  if (!data.lineItems || data.lineItems.length === 0) {
    throw new Error("At least one service line is required.");
  }
  for (const l of data.lineItems) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1) {
      throw new Error(`Line "${l.description}": quantity must be a whole number of at least 1.`);
    }
    if (!Number.isFinite(l.unitCost) || l.unitCost <= 0) {
      throw new Error(`Line "${l.description}": unit cost must be greater than 0.`);
    }
    if (Math.abs(l.billedAmount - l.quantity * l.unitCost) > 0.01) {
      throw new Error(
        `Line "${l.description}": billed amount (${l.billedAmount}) does not equal quantity × unit cost.`,
      );
    }
  }

  // ── Service-date gate (PR-013) ────────────────────────────────────────────
  assertServiceDateNotFuture(new Date(data.dateOfService));

  // ── Eligibility gate ──────────────────────────────────────────────────────
  const member = await prisma.member.findUnique({
    where: { id: data.memberId, tenantId },
    include: { group: { select: { status: true, name: true } } },
  });
  if (!member) throw new Error("Member not found");

  const BLOCKED = ["SUSPENDED", "LAPSED", "TERMINATED"];
  if (BLOCKED.includes(member.status)) {
    throw new Error(`Cannot submit claim: member ${member.firstName} ${member.lastName} is ${member.status}.`);
  }
  if (member.group && BLOCKED.includes(member.group.status)) {
    throw new Error(`Cannot submit claim: group "${member.group.name}" is ${member.group.status}.`);
  }

  // ── Provider gate (PR-006, server-enforced) ──────────────────────────────
  const gateProvider = await prisma.provider.findUnique({
    where: { id: data.providerId, tenantId },
    select: { contractStatus: true, name: true },
  });
  if (!gateProvider) throw new Error("Provider not found");
  if (!ProvidersService.isOperational(gateProvider.contractStatus)) {
    throw new Error(
      `Provider "${gateProvider.name}" is ${gateProvider.contractStatus} — claims can only be submitted against ACTIVE providers.`,
    );
  }
  if (data.providerBranchId) {
    const branch = await prisma.providerBranch.findUnique({
      where: { id: data.providerBranchId },
      select: { providerId: true, isActive: true, tenantId: true },
    });
    if (!branch || branch.tenantId !== tenantId || branch.providerId !== data.providerId) {
      throw new Error("Selected branch does not belong to the selected provider.");
    }
    if (!branch.isActive) throw new Error("Selected branch is deactivated — pick an active branch.");
  }

  // ── Benefit-in-package gate (PR-024, server-enforced at intake) ──────────
  const { BenefitUsageService } = await import("@/server/services/benefit-usage.service");
  const benefitCfg = await BenefitUsageService.resolveConfig(prisma, data.memberId, data.benefitCategory);
  if (!benefitCfg) {
    throw new Error(
      `Benefit "${data.benefitCategory.replace(/_/g, " ")}" is not in this member's package — ` +
        `the claim could never be approved against it. Pick a benefit category from the member's package.`,
    );
  }

  // ── Pre-auth gate ─────────────────────────────────────────────────────────
  const PREAUTH_REQUIRED: BenefitCategory[] = ["INPATIENT", "SURGICAL", "MATERNITY"];
  let approvedPA: { id: string; preauthNumber: string } | null = null;
  if (PREAUTH_REQUIRED.includes(data.benefitCategory)) {
    approvedPA = await prisma.preAuthorization.findFirst({
      where: {
        tenantId,
        memberId: data.memberId,
        providerId: data.providerId,
        benefitCategory: data.benefitCategory,
        status: "APPROVED",
        claimId: null,
        validUntil: { gte: new Date() },
      },
      select: { id: true, preauthNumber: true },
    });
    if (!approvedPA) {
      throw new Error(
        `${data.benefitCategory.charAt(0) + data.benefitCategory.slice(1).toLowerCase()} claims require an approved pre-authorization for this facility. ` +
          `Please submit a pre-auth request (at this provider) and obtain approval before submitting this claim.`,
      );
    }
  }

  const billedAmount = data.lineItems.reduce((s, l) => s + l.billedAmount, 0);

  const count = await prisma.claim.count({ where: { tenantId } });
  const claimNumber = `CLM-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

  // PR-017 D2: stamp the claim currency at intake.
  const currency = await ClaimsService.resolveClaimCurrency(tenantId, data.providerId, data.memberId);

  const claim = await prisma.claim.create({
    data: {
      tenantId,
      claimNumber,
      currency,
      memberId: data.memberId,
      providerId: data.providerId,
      providerBranchId: data.providerBranchId || null,
      preauths: approvedPA ? { connect: [{ id: approvedPA.id }] } : undefined,
      serviceType: data.serviceType,
      benefitCategory: data.benefitCategory,
      dateOfService: new Date(data.dateOfService),
      admissionDate: data.admissionDate ? new Date(data.admissionDate) : null,
      dischargeDate: data.dischargeDate ? new Date(data.dischargeDate) : null,
      attendingDoctor: data.attendingDoctor || null,
      diagnoses: data.diagnoses as never,
      procedures: data.lineItems as never,
      billedAmount,
      status: "RECEIVED",
      claimLines: {
        create: data.lineItems.map((l, i) => ({
          lineNumber: i + 1,
          serviceCategory: l.serviceCategory,
          description: l.description,
          cptCode: l.cptCode || null,
          icdCode: l.icdCode || null,
          quantity: l.quantity,
          unitCost: l.unitCost,
          billedAmount: l.billedAmount,
        })),
      },
    },
  });

  if (approvedPA) {
    await prisma.preAuthorization.update({
      where: { id: approvedPA.id },
      data: { status: "ATTACHED", attachedAt: new Date() },
    });
  }

  // Member notification — "visit recorded". Fired before auto-adjudication so a
  // received-then-decided claim notifies in the right order. Never throws.
  await MemberNotificationService.notifyForClaim({
    tenantId,
    memberId: data.memberId,
    type: "CLAIM_STATUS",
    title: "Visit recorded",
    body:
      `${member.firstName} ${member.lastName} — ${gateProvider.name}: ` +
      `${data.benefitCategory.replace(/_/g, " ").toLowerCase()} visit on ` +
      `${new Date(data.dateOfService).toLocaleDateString("en-UG")} recorded (${claimNumber}). ` +
      `Billed ${currency} ${billedAmount.toLocaleString()}. We'll notify you when it's assessed.`,
    href: "/member/utilization",
    metadata: { claimId: claim.id, claimNumber, event: "RECEIVED" },
  });

  await FraudService.evaluateClaim(claim.id, tenantId);

  // Intake pipeline (G3.7/G9.5): drug exclusions + auto-adjudication.
  await AutoAdjudicationService.processIntake(tenantId, claim.id, actorUserId);

  await writeAudit({
    userId: actorUserId,
    action: "CLAIM_SUBMITTED",
    module: "CLAIMS",
    description: `Claim ${claimNumber} submitted — UGX ${billedAmount.toLocaleString()} (${data.benefitCategory})`,
    metadata: { claimNumber, memberId: data.memberId, billedAmount },
  });

  return { claim, claimNumber, billedAmount };
}
