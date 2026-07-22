"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { runClaimIntake } from "@/server/services/claim-intake";
import { reimbursementService } from "@/server/services/reimbursement.service";
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
  idempotencyKey: string; // F5.1: the form's draft UUID — replays across retry/refresh
  memberId: string;
  providerId: string;
  providerBranchId?: string; // PR-007: optional branch for multi-branch providers
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

  // Canonical intake (F5.1): the operator selects the provider; the same schema,
  // scope, staged evaluation and durable receipt as every other rail apply.
  // Structural rejections (bad amount, future date, out-of-scope provider/member)
  // return a friendly message; eligibility/benefit/PA are accepted-and-routed (D6).
  const result = await runClaimIntake(
    { kind: "operatorUser", tenantId: session.user.tenantId, userId: session.user.id },
    data,
    { idempotencyKey: data.idempotencyKey },
  );
  if (!result.ok) return { ok: false as const, error: result.error };

  // Receipt link visible after submit: land on the accepted claim.
  redirect(result.claimId ? `/claims/${result.claimId}` : "/claims");
}

export async function submitReimbursementClaimAction(data: {
  idempotencyKey?: string; // F5.6: form draft UUID — replays across retry
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
  proofFileUrl?: string;
  proofType?: string;
  mpesaConfirmationCode?: string;
}) {
  const session = await requireRole(ROLES.OPS);

  if (!data.reimbursementBankName && !data.reimbursementMpesaPhone) {
    return { ok: false as const, error: "Provide either bank account details or a mobile-money phone number for the reimbursement payment." };
  }

  // F5.6: ONE reimbursement path — the service adapts onto the canonical
  // intake (channel/source REIMBURSEMENT, D13 always-manual proof review).
  let claimId: string | null = null;
  try {
    const result = await reimbursementService.submit({
      tenantId: session.user.tenantId,
      submittedById: session.user.id,
      memberId: data.memberId,
      providerId: data.providerId,
      serviceDate: new Date(data.dateOfService),
      totalPaidByMember: data.lineItems.reduce((s, l) => s + l.billedAmount, 0),
      diagnoses: data.diagnoses.map((d) => ({ code: d.code, description: d.description, isPrimary: d.isPrimary })),
      lineItems: data.lineItems.map((l) => ({
        serviceCategory: l.serviceCategory,
        cptCode: l.cptCode || undefined,
        icdCode: l.icdCode || undefined,
        description: l.description,
        quantity: l.quantity,
        unitCost: l.unitCost,
      })),
      benefitCategory: data.benefitCategory,
      idempotencyKey: data.idempotencyKey,
      attendingDoctor: data.attendingDoctor,
      invoiceNumber: data.invoiceNumber,
      bankName: data.reimbursementBankName,
      accountNo: data.reimbursementAccountNo,
      mpesaPhone: data.reimbursementMpesaPhone,
      proofFileUrl: data.proofFileUrl,
      proofType: data.proofType as never,
      mpesaConfirmationCode: data.mpesaConfirmationCode,
      disbursementMethod: data.reimbursementMpesaPhone ? "MPESA" : data.reimbursementBankName ? "BANK_TRANSFER" : undefined,
    });
    claimId = result.claimId;
  } catch (err) {
    // Next.js masks thrown server-action messages in production — return the
    // safe message instead (IntakeError/TRPCError messages are caller-safe).
    return { ok: false as const, error: err instanceof Error ? err.message : "The reimbursement could not be submitted." };
  }

  redirect(claimId ? `/claims/${claimId}` : "/claims");
}
