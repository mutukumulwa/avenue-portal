"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { FraudService } from "@/server/services/fraud.service";
import { AutoAdjudicationService } from "@/server/services/auto-adjudication.service";
import type { ServiceType, BenefitCategory, ClaimLineCategory } from "@prisma/client";

interface LineItemInput {
  serviceCategory: ClaimLineCategory;
  cptCode: string;
  description: string;
  icdCode: string;
  quantity: number;
  unitCost: number;
  billedAmount: number;
}

interface DiagnosisInput {
  code: string;
  description: string;
  standardCharge: number | null;
  isPrimary: boolean;
}

export async function submitClaimAction(data: {
  memberId: string;
  providerId: string;
  serviceType: ServiceType;
  benefitCategory: BenefitCategory;
  dateOfService: string;
  admissionDate?: string;
  dischargeDate?: string;
  attendingDoctor?: string;
  diagnoses: DiagnosisInput[];
  lineItems: LineItemInput[];
}) {
  const session = await requireRole(ROLES.OPS);

  const tenantId = session.user.tenantId;

  // ── Eligibility gate ──────────────────────────────────────────────────────
  const member = await prisma.member.findUnique({
    where: { id: data.memberId, tenantId },
    include: { group: { select: { status: true, name: true } } },
  });
  if (!member) throw new Error("Member not found");

  const BLOCKED = ["SUSPENDED", "LAPSED", "TERMINATED"];
  if (BLOCKED.includes(member.status)) {
    throw new Error(
      `Cannot submit claim: member ${member.firstName} ${member.lastName} is ${member.status}.`
    );
  }
  if (member.group && BLOCKED.includes(member.group.status)) {
    throw new Error(
      `Cannot submit claim: group "${member.group.name}" is ${member.group.status}.`
    );
  }
  // ── Pre-auth gate ─────────────────────────────────────────────────────────
  const PREAUTH_REQUIRED: BenefitCategory[] = ["INPATIENT", "SURGICAL", "MATERNITY"];
  let approvedPA = null;
  if (PREAUTH_REQUIRED.includes(data.benefitCategory)) {
    approvedPA = await prisma.preAuthorization.findFirst({
      where: {
        tenantId,
        memberId:        data.memberId,
        benefitCategory: data.benefitCategory,
        status:          "APPROVED",
        claimId:         null, // not already attached elsewhere (WP-C2)
        validUntil:      { gte: new Date() },
      },
      select: { id: true, preauthNumber: true },
    });
    if (!approvedPA) {
      throw new Error(
        `${data.benefitCategory.charAt(0) + data.benefitCategory.slice(1).toLowerCase()} claims require an approved pre-authorization. ` +
        `Please submit a pre-auth request and obtain approval before submitting this claim.`
      );
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const billedAmount = data.lineItems.reduce((s, l) => s + l.billedAmount, 0);

  // Build claim number
  const count = await prisma.claim.count({ where: { tenantId } });
  const claimNumber = `CLM-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

  const claim = await prisma.claim.create({
    data: {
      tenantId,
      claimNumber,
      memberId:        data.memberId,
      providerId:      data.providerId,
      // Attach the approved PA (WP-C1): FK lives on PreAuthorization.claimId.
      preauths:        approvedPA ? { connect: [{ id: approvedPA.id }] } : undefined,
      serviceType:     data.serviceType,
      benefitCategory: data.benefitCategory,
      dateOfService:   new Date(data.dateOfService),
      admissionDate:   data.admissionDate ? new Date(data.admissionDate) : null,
      dischargeDate:   data.dischargeDate ? new Date(data.dischargeDate) : null,
      attendingDoctor: data.attendingDoctor || null,
      diagnoses:       data.diagnoses as never,
      procedures:      data.lineItems as never,
      billedAmount,
      status:          "RECEIVED",
      claimLines: {
        create: data.lineItems.map((l, i) => ({
          lineNumber:      i + 1,
          serviceCategory: l.serviceCategory,
          description:     l.description,
          cptCode:         l.cptCode || null,
          icdCode:         l.icdCode || null,
          quantity:        l.quantity,
          unitCost:        l.unitCost,
          billedAmount:    l.billedAmount,
        })),
      },
    },
  });

  // Stamp attachment state on the connected PA (WP-C2).
  if (approvedPA) {
    await prisma.preAuthorization.update({
      where: { id: approvedPA.id },
      data: { status: "ATTACHED", attachedAt: new Date() },
    });
  }

  await FraudService.evaluateClaim(claim.id, session.user.tenantId);

  // Intake pipeline (G3.7/G9.5): drug exclusions + auto-adjudication.
  // Runs after fraud evaluation so open alerts gate auto-approval.
  await AutoAdjudicationService.processIntake(tenantId, claim.id, session.user.id);

  await writeAudit({
    userId: session.user.id,
    action: "CLAIM_SUBMITTED",
    module: "CLAIMS",
    description: `Claim ${claimNumber} submitted — KES ${billedAmount.toLocaleString()} (${data.benefitCategory})`,
    metadata: { claimNumber, memberId: data.memberId, billedAmount },
  });

  redirect("/claims");
}

export async function submitReimbursementClaimAction(data: {
  memberId: string;
  providerId: string;
  benefitCategory: BenefitCategory;
  dateOfService: string;
  attendingDoctor?: string;
  diagnoses: DiagnosisInput[];
  lineItems: LineItemInput[];
  invoiceNumber?: string;
  reimbursementBankName?: string;
  reimbursementAccountNo?: string;
  reimbursementMpesaPhone?: string;
  // Process 10 additions
  proofFileUrl?: string;
  proofType?: string;
  mpesaConfirmationCode?: string;
}) {
  const session = await requireRole(ROLES.OPS);
  const tenantId = session.user.tenantId;

  const member = await prisma.member.findUnique({
    where: { id: data.memberId, tenantId },
    include: { group: { select: { status: true, name: true } } },
  });
  if (!member) throw new Error("Member not found");

  const BLOCKED = ["SUSPENDED", "LAPSED", "TERMINATED"];
  if (BLOCKED.includes(member.status)) {
    throw new Error(`Cannot submit reimbursement: member ${member.firstName} ${member.lastName} is ${member.status}.`);
  }
  if (member.group && BLOCKED.includes(member.group.status)) {
    throw new Error(`Cannot submit reimbursement: group "${member.group.name}" is ${member.group.status}.`);
  }

  if (!data.reimbursementBankName && !data.reimbursementMpesaPhone) {
    throw new Error("Provide either bank account details or a mobile-money phone number for the reimbursement payment.");
  }

  const billedAmount = data.lineItems.reduce((s, l) => s + l.billedAmount, 0);
  const count = await prisma.claim.count({ where: { tenantId } });
  const claimNumber = `CLM-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

  const claim = await prisma.claim.create({
    data: {
      tenantId,
      claimNumber,
      memberId:                data.memberId,
      providerId:              data.providerId,
      source:                  "REIMBURSEMENT",
      serviceType:             "OUTPATIENT",
      benefitCategory:         data.benefitCategory,
      dateOfService:           new Date(data.dateOfService),
      attendingDoctor:         data.attendingDoctor || null,
      diagnoses:               data.diagnoses as never,
      procedures:              data.lineItems as never,
      billedAmount,
      status:                  "RECEIVED",
      isReimbursement:         true,
      invoiceNumber:           data.invoiceNumber || null,
      reimbursementBankName:   data.reimbursementBankName || null,
      reimbursementAccountNo:  data.reimbursementAccountNo || null,
      reimbursementMpesaPhone: data.reimbursementMpesaPhone || null,
      claimLines: {
        create: data.lineItems.map((l, i) => ({
          lineNumber:      i + 1,
          serviceCategory: l.serviceCategory,
          description:     l.description,
          cptCode:         l.cptCode || null,
          icdCode:         l.icdCode || null,
          quantity:        l.quantity,
          unitCost:        l.unitCost,
          billedAmount:    l.billedAmount,
        })),
      },
    },
  });

  // Process 10: create ReimbursementRequest record if proof provided
  if (data.proofFileUrl) {
    const provider = await prisma.provider.findUnique({ where: { id: data.providerId }, select: { name: true } });
    await prisma.reimbursementRequest.create({
      data: {
        tenantId,
        claimId:              claim.id,
        memberId:             data.memberId,
        providerName:         provider?.name ?? "Unknown Provider",
        serviceDate:          new Date(data.dateOfService),
        totalPaidByMember:    billedAmount,
        proofType:            (data.proofType as "RECEIPT_PHOTO" | "MPESA_SMS" | "BANK_STATEMENT" | "OTHER") ?? "RECEIPT_PHOTO",
        proofFileUrl:         data.proofFileUrl,
        mpesaConfirmationCode: data.mpesaConfirmationCode || null,
        mpesaNote:            data.proofType === "MPESA_SMS" && data.mpesaConfirmationCode
          ? "Mobile-money verification pending provider API integration — verify manually (never trust the SMS alone)"
          : null,
        submittedWithinWindow: true,
        disbursementMethod:   data.reimbursementMpesaPhone ? "MPESA" : data.reimbursementBankName ? "BANK_TRANSFER" : null,
      },
    });
  }

  await FraudService.evaluateClaim(claim.id, tenantId);

  // Intake pipeline: reimbursements always ROUTE (manual proof verification),
  // but excluded-drug lines are still declined at receipt.
  await AutoAdjudicationService.processIntake(tenantId, claim.id, session.user.id);

  await writeAudit({
    userId: session.user.id,
    action: "REIMBURSEMENT_SUBMITTED",
    module: "CLAIMS",
    description: `Reimbursement claim ${claimNumber} submitted — KES ${billedAmount.toLocaleString()} (${data.benefitCategory})`,
    metadata: { claimNumber, memberId: data.memberId, billedAmount },
  });

  redirect("/claims");
}
