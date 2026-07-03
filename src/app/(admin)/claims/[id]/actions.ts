"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClaimsService } from "@/server/services/claims.service";
import { ApprovalMatrixService } from "@/server/services/approval-matrix.service";
import { ApprovalRequestService } from "@/server/services/approval-request.service";
import { CoContributionService } from "@/server/services/coContribution/coContribution.service";
import { GLService } from "@/server/services/gl.service";
import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";

export async function adjudicateClaimAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const tenantId = session.user.tenantId;
  const claimId = formData.get("claimId") as string;
  const action = formData.get("action") as "CAPTURED" | "APPROVED" | "PARTIALLY_APPROVED" | "DECLINED";

  let errorMsg = "";
  try {
    // CAPTURED is a state transition only — mark claim as data-entry complete
    if (action === "CAPTURED") {
      await prisma.claim.update({
        where: { id: claimId, tenantId },
        data: { status: "CAPTURED" },
      });
      await prisma.adjudicationLog.create({
        data: { claimId, action: "CAPTURED", toStatus: "CAPTURED", notes: "Claim data entry complete — forwarded for review.", userId: session.user.id },
      });
      revalidatePath(`/claims/${claimId}`);
      revalidatePath("/claims");
      return;
    }

    const approvedAmount = action !== "DECLINED" ? Number(formData.get("approvedAmount") || 0) : 0;

    // ── Approval-matrix engine (G3.1) ─────────────────────────────────────────
    // Route the claim-payment authorization through the matrix engine: it
    // resolves the single governing rule (client-scoped, action-typed, amount
    // band FX-normalised to base) and gates on the first required role. Replaces
    // the prior ad-hoc band/role check (resolves AICARE_TODO V-02).
    if (action === "APPROVED" || action === "PARTIALLY_APPROVED") {
      const claim = await prisma.claim.findUnique({
        where: { id: claimId, tenantId },
        select: {
          serviceType: true,
          benefitCategory: true,
          adjudicatorId: true,
          member: { select: { group: { select: { clientId: true } } } },
        },
      });
      if (claim) {
        const resolved = await ApprovalMatrixService.resolve(tenantId, {
          actionType: "CLAIM_PAYMENT",
          clientId: claim.member?.group?.clientId ?? null,
          amount: approvedAmount,
          currency: "UGX",
          serviceType: claim.serviceType,
          benefitCategory: claim.benefitCategory,
        });
        if (resolved) {
          // Multi-level rule → open (or require) an ApprovalRequest worked
          // through the Approvals console; the direct approval is blocked.
          if (resolved.steps.length > 1) {
            const existing = await prisma.approvalRequest.findFirst({
              where: { tenantId, entityType: "Claim", entityId: claimId, status: { in: ["PENDING", "ESCALATED"] } },
              select: { id: true },
            });
            if (!existing) {
              await ApprovalRequestService.create(tenantId, {
                actionType: "CLAIM_PAYMENT",
                entityType: "Claim",
                entityId: claimId,
                makerId: session.user.id,
                clientId: claim.member?.group?.clientId ?? null,
                amount: approvedAmount,
                currency: "UGX",
                serviceType: claim.serviceType,
                benefitCategory: claim.benefitCategory,
              });
            }
            throw new Error(
              `This claim (UGX ${approvedAmount.toLocaleString()}) needs ${resolved.steps.length}-level approval. A request has been opened — action it in Approvals.`,
            );
          }
          // Single-level rule → synchronous role gate + SoD.
          const step = resolved.steps[0];
          if (!ApprovalMatrixService.roleAuthorised(session.user.role, step.requiredRole)) {
            throw new Error(
              `Approval matrix: this claim (UGX ${approvedAmount.toLocaleString()}) requires ${step.requiredRole.replace(/_/g, " ")} or above. Your role (${session.user.role}) is not authorised to approve it.`,
            );
          }
          // Segregation of duties: the approver must not be the claim's adjudicator/maker.
          if (claim.adjudicatorId) {
            ApprovalMatrixService.enforceSegregationOfDuties(claim.adjudicatorId, session.user.id);
          }
        }
      }
    }

    // ── Contract enforcement block ────────────────────────────────────────────
    // The provider's ACTIVE contract governs what each line may pay:
    // scheduled rates cap coded lines, exclusions pay zero, the contract's
    // unlisted-service rule decides everything else.
    // ── Benefit funding model (WP-F2/D8) ─────────────────────────────────────
    // CAPITATION-funded lines are prepaid via the provider's pool: they leave
    // the FFS pricing path entirely (payable 0, pool-tagged on decision).
    const { FundingModelService } = await import("@/server/services/funding-model.service");
    const funding = await FundingModelService.resolveForClaim(tenantId, claimId);
    const capitatedLineIds = new Set(funding.lines.filter((l) => l.capitated).map((l) => l.lineId));

    if (action === "APPROVED" || action === "PARTIALLY_APPROVED") {
      const { contract, lines: allRates } = await ClaimsService.resolveClaimContractRates(tenantId, claimId);
      // Capitated lines skip FFS enforcement — they price at 0 regardless.
      const rates = allRates.filter((r) => !capitatedLineIds.has(r.lineId));
      if (rates.length > 0) {
        const claimMeta = await prisma.claim.findUnique({
          where: { id: claimId, tenantId },
          select: { preauths: { select: { id: true } } },
        });

        // Contract requires pre-authorization for specific services
        const paLines = rates.filter(r => r.requiresPreauth);
        if (paLines.length > 0 && (claimMeta?.preauths.length ?? 0) === 0) {
          const codes = paLines.map(r => r.cptCode ?? "uncoded").join(", ");
          throw new Error(
            `Contract ${contract?.contractNumber ?? ""} requires pre-authorization for: ${codes}. Link an approved PA to this claim or decline the line(s).`,
          );
        }

        // Quantity caps per visit
        const qtyLines = rates.filter(r => r.quantityExceeded);
        if (qtyLines.length > 0) {
          const detail = qtyLines.map(r => `${r.cptCode ?? "uncoded"} (${r.quantity} > max ${r.maxQuantityPerVisit})`).join(", ");
          throw new Error(`Contract quantity limits exceeded: ${detail}. Reduce the billed quantity or query the provider.`);
        }

        // Payable ceiling: enforce wherever the contract gives a hard number.
        let ceiling = 0;
        let hasEnforceableLines = false;
        const zeroRules: string[] = [];
        for (const r of rates) {
          const cappedQty = r.maxQuantityPerVisit != null ? Math.min(r.quantity, r.maxQuantityPerVisit) : r.quantity;
          if (r.allowedUnit !== null) {
            hasEnforceableLines = true;
            ceiling += r.allowedUnit * cappedQty;
            if (r.allowedUnit === 0) zeroRules.push(`${r.cptCode ?? "uncoded"} (${r.ruleApplied === "EXCLUDED" ? "excluded by contract" : "unlisted services not payable"})`);
          } else {
            ceiling += r.unitCost * cappedQty; // REFER_FOR_REVIEW / no contract — reviewer judgement
          }
        }

        if (hasEnforceableLines && approvedAmount > ceiling) {
          const ruleNote = contract
            ? `Contract ${contract.contractNumber} (unlisted services: ${contract.unlistedServiceRule.replace(/_/g, " ").toLowerCase()}${contract.unlistedDiscountPct != null ? ` ${contract.unlistedDiscountPct}%` : ""})`
            : "Provider tariff schedule";
          const zeroNote = zeroRules.length ? ` Non-payable lines: ${zeroRules.join("; ")}.` : "";
          throw new Error(
            `Contract enforcement: approved amount (KES ${approvedAmount.toLocaleString()}) exceeds the payable ceiling of KES ${Math.round(ceiling).toLocaleString()} under ${ruleNote}.${zeroNote} Reduce the amount or query the provider.`,
          );
        }
      }
    }

    // PA cover cap (WP-C2): warn — never block — when the claim exceeds the
    // attached pre-auth cover. The overage note travels in the adjudication log.
    let notes = (formData.get("notes") as string) || undefined;
    if (action === "APPROVED" || action === "PARTIALLY_APPROVED") {
      const coverage = await ClaimsService.getPreauthCoverage(tenantId, claimId);
      if (coverage.exceedsCover) {
        const warn = `PA cover warning: billed ${coverage.billedAmount.toLocaleString()} exceeds attached pre-auth cover ${coverage.approvedCover.toLocaleString()}.`;
        notes = notes ? `${notes} ${warn}` : warn;
      }
      if (funding.anyCapitated) {
        const note = `COVERED_BY_CAPITATION: ${capitatedLineIds.size} line(s) are prepaid via the capitation pool and price at 0.`;
        notes = notes ? `${notes} ${note}` : note;
      }
    }

    const claim = await ClaimsService.adjudicateClaim(tenantId, claimId, {
      action,
      approvedAmount,
      declineReasonCode: formData.get("declineReasonCode") as string || undefined,
      declineNotes: formData.get("declineNotes") as string || undefined,
      notes,
      reviewerId: session.user.id,
    });

    // WP-F2: zero the capitated lines + tag the pool on the decided claim.
    if (action === "APPROVED" || action === "PARTIALLY_APPROVED") {
      await FundingModelService.applyToDecidedClaim(tenantId, claimId, funding);
    }

    // Auto-post GL entry when claim is approved or partially approved
    if ((action === "APPROVED" || action === "PARTIALLY_APPROVED") && approvedAmount > 0) {
      try {
        const coTx = await prisma.coContributionTransaction.findUnique({
          where: { claimId },
          select: { finalAmount: true },
        });
        const coContribAmount = coTx ? Number(coTx.finalAmount) : 0;

        await GLService.postClaimApproved(tenantId, {
          sourceId:  claim.id,
          reference: claim.claimNumber,
          amount:    approvedAmount,
          coContributionAmount: coContribAmount,
          postedById: session.user.id,
        });
      } catch {
        // GL not yet set up — swallow silently so adjudication still completes
      }
    }

    // ── Self-funded deduction ──────────────────────────────────────────────────
    if ((action === "APPROVED" || action === "PARTIALLY_APPROVED") && approvedAmount > 0) {
      try {
        const memberGroup = await prisma.member.findUnique({
          where: { id: claim.memberId },
          select: { group: { select: { fundingMode: true, selfFundedAccount: { select: { id: true, balance: true } } } } },
        });
        const account = memberGroup?.group?.selfFundedAccount;
        if (memberGroup?.group?.fundingMode === "SELF_FUNDED" && account) {
          const newBalance = Number(account.balance) - approvedAmount;
          await prisma.$transaction([
            prisma.selfFundedAccount.update({
              where: { id: account.id },
              data: { balance: newBalance, totalClaims: { increment: approvedAmount } },
            }),
            prisma.fundTransaction.create({
              data: {
                tenantId,
                selfFundedAccountId: account.id,
                claimId: claim.id,
                type: "CLAIM_DEDUCTION",
                amount: approvedAmount,
                balanceAfter: newBalance,
                description: `Claim ${claim.claimNumber} — ${action.replace(/_/g, " ").toLowerCase()}`,
                postedById: session.user.id,
              },
            }),
          ]);
        }
      } catch {
        // Fund deduction failed — log silently, adjudication already committed
      }
    }

    await writeAudit({
      userId: session.user.id,
      action: `CLAIM_${action}`,
      module: "CLAIMS",
      description: `Claim ${claim.claimNumber} ${action.toLowerCase().replace(/_/g, " ")} — KES ${approvedAmount.toLocaleString()}`,
      metadata: { claimId, action, approvedAmount },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "An error occurred";
  }

  if (errorMsg) {
    redirect(`/claims/${claimId}?error=${encodeURIComponent(errorMsg)}`);
  }
  
  redirect(`/claims`);
}

// ── Exception logging ──────────────────────────────────────────────────────

export async function raiseExceptionAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);

  const claimId     = formData.get("claimId")       as string;
  const entityRef   = formData.get("entityRef")     as string;
  const exceptionCode = formData.get("exceptionCode") as string;
  const reason      = formData.get("reason")        as string;
  const notes       = (formData.get("notes") as string) || null;

  // Verify claim belongs to this tenant
  const claim = await prisma.claim.findUnique({
    where: { id: claimId, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!claim) throw new Error("Claim not found");

  await prisma.$transaction([
    prisma.exceptionLog.create({
      data: {
        tenantId:      session.user.tenantId,
        entityType:    "CLAIM",
        entityId:      claimId,
        entityRef,
        claimId,
        exceptionCode,
        reason,
        notes,
        raisedById:    session.user.id,
      },
    }),
    prisma.claim.update({
      where: { id: claimId },
      data:  { hasException: true },
    }),
  ]);

  await writeAudit({
    userId: session.user.id,
    action: "EXCEPTION_RAISED",
    module: "CLAIMS",
    description: `Exception raised on claim ${entityRef}: ${exceptionCode} — ${reason}`,
    metadata: { claimId, exceptionCode },
  });

  revalidatePath(`/claims/${claimId}`);
}

export async function resolveExceptionAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);

  const exceptionId    = formData.get("exceptionId")    as string;
  const claimId        = formData.get("claimId")        as string;
  const status         = formData.get("status")         as "APPROVED" | "REJECTED";
  const resolutionNote = (formData.get("resolutionNote") as string) || null;

  const log = await prisma.exceptionLog.findUnique({
    where:   { id: exceptionId },
    include: { tenant: { select: { id: true } } },
  });
  if (!log || log.tenantId !== session.user.tenantId) throw new Error("Not found");

  await prisma.exceptionLog.update({
    where: { id: exceptionId },
    data: {
      status,
      resolvedById:   session.user.id,
      resolvedAt:     new Date(),
      resolutionNote,
    },
  });

  // If all exceptions for this claim are resolved, clear the flag
  const pending = await prisma.exceptionLog.count({
    where: { claimId, status: "PENDING" },
  });
  if (pending === 0) {
    await prisma.claim.update({ where: { id: claimId }, data: { hasException: false } });
  }

  await writeAudit({
    userId: session.user.id,
    action: `EXCEPTION_${status}`,
    module: "CLAIMS",
    description: `Exception ${status.toLowerCase()} for claim — ${resolutionNote ?? "no note"}`,
    metadata: { exceptionId, claimId, status },
  });

  revalidatePath(`/claims/${claimId}`);
  revalidatePath(`/settings/exceptions`);
}

// ── Co-contribution collection ─────────────────────────────────────────────

export async function collectCoContributionAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireRole(ROLES.OPS);

  const transactionId    = formData.get("transactionId") as string;
  const amountCollected  = Number(formData.get("amountCollected"));
  const paymentMethod    = formData.get("paymentMethod") as string;
  const mpesaRef         = (formData.get("mpesaRef") as string) || undefined;

  if (!transactionId || isNaN(amountCollected) || amountCollected <= 0) {
    return { error: "Invalid collection details." };
  }

  const tx = await prisma.coContributionTransaction.findUnique({
    where: { id: transactionId },
    select: { id: true, claimId: true, tenantId: true },
  });
  if (!tx || tx.tenantId !== session.user.tenantId) return { error: "Transaction not found." };

  await CoContributionService.recordCollection(
    transactionId,
    new Decimal(amountCollected),
    paymentMethod,
    mpesaRef,
  );

  // GL: DR Cash/M-Pesa  CR 1150 Co-Contribution Receivable
  const claim = await prisma.claim.findUnique({ where: { id: tx.claimId }, select: { claimNumber: true } });
  try {
    await GLService.postCoContributionCollected(tx.tenantId, {
      sourceId:      transactionId,
      reference:     claim?.claimNumber ?? transactionId,
      amount:        amountCollected,
      paymentMethod,
      postedById:    session.user.id,
    });
  } catch { /* GL accounts not yet set up — swallow */ }

  revalidatePath(`/claims/${tx.claimId}`);
  return {};
}

export async function waiveCoContributionAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireRole(ROLES.OPS);

  const transactionId = formData.get("transactionId") as string;
  const reason        = (formData.get("reason") as string)?.trim();
  const approvedBy    = (formData.get("approvedBy") as string)?.trim();

  if (!transactionId || !reason || reason.length < 10 || !approvedBy) {
    return { error: "Provide a reason (min 10 chars) and the approver name." };
  }

  const tx = await prisma.coContributionTransaction.findUnique({
    where: { id: transactionId },
    select: { id: true, claimId: true, tenantId: true, finalAmount: true },
  });
  if (!tx || tx.tenantId !== session.user.tenantId) return { error: "Transaction not found." };

  await CoContributionService.waiveCoContribution(transactionId, reason, approvedBy);

  // GL: DR 5010 Net Claims Incurred  CR 1150 Co-Contribution Receivable
  const claim = await prisma.claim.findUnique({ where: { id: tx.claimId }, select: { claimNumber: true } });
  try {
    await GLService.postCoContributionWaived(tx.tenantId, {
      sourceId:   transactionId,
      reference:  claim?.claimNumber ?? transactionId,
      amount:     Number(tx.finalAmount),
      postedById: session.user.id,
    });
  } catch { /* GL accounts not yet set up — swallow */ }

  revalidatePath(`/claims/${tx.claimId}`);
  return {};
}

// ─── PRE-AUTH ATTACHMENT (WP-C3) ─────────────────────────────────────────────

export async function attachPreauthAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const claimId = formData.get("claimId") as string;
  const preauthId = formData.get("preauthId") as string;

  const pa = await ClaimsService.attachPreauth(session.user.tenantId, claimId, preauthId);
  await writeAudit({
    userId: session.user.id,
    action: "PREAUTH_ATTACHED",
    module: "CLAIMS",
    description: `Pre-auth ${pa.preauthNumber} attached to claim ${claimId.slice(0, 8)}`,
    metadata: { claimId, preauthId },
  });
  revalidatePath(`/claims/${claimId}`);
}

export async function detachPreauthAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const claimId = formData.get("claimId") as string;
  const preauthId = formData.get("preauthId") as string;

  await ClaimsService.detachPreauth(session.user.tenantId, claimId, preauthId);
  await writeAudit({
    userId: session.user.id,
    action: "PREAUTH_DETACHED",
    module: "CLAIMS",
    description: `Pre-auth ${preauthId.slice(0, 8)} detached from claim ${claimId.slice(0, 8)}`,
    metadata: { claimId, preauthId },
  });
  revalidatePath(`/claims/${claimId}`);
}
