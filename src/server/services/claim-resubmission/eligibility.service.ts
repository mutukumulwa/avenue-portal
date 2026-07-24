import { prisma } from "@/lib/prisma";
import { ProviderAccessService, type ProviderAccessContext } from "@/server/services/provider-access.service";
import { resolveResubmissionReason, resubmissionDeadline, RESUBMIT_PERMISSION, type WindowBasis } from "./policy";

/**
 * PNOS F5.9 — provider-correctable resubmission eligibility (READ-ONLY).
 *
 * ONE service computes WHETHER, WHY, and UNTIL WHEN a declined claim may be resubmitted.
 * It writes nothing and mutates no status — it only reads and returns a decision, which
 * the provider UI and the F5.10 submit both consume. Every returned reason is SAFE
 * (provider-facing) — an internal/fraud rationale is never disclosed (§9).
 *
 * Not eligible when: the claim is not this provider's (non-enumerating NOT_FOUND); the
 * actor lacks the permission/branch; the claim is not DECLINED; a resubmission already
 * exists (the claim is not the current chain head); the decline reason forbids it; or the
 * contract submission window has passed.
 *
 * NOTE (spec step 4 "required request/doc response accepted"): a DECLINED claim is
 * terminally decided and carries no outstanding info-request response to accept (that is
 * the PENDED / PA-side F4 flow; no claim-side info-request model exists). When one is
 * added, gate it here.
 */

export type ResubmissionEligibilityCode =
  | "ELIGIBLE"
  | "NOT_FOUND" // absent OR out-of-boundary — indistinguishable (§9.1)
  | "FORBIDDEN" // missing permission or branch
  | "NOT_DECLINED"
  | "ALREADY_RESUBMITTED"
  | "REASON_NOT_RESUBMITTABLE"
  | "DEADLINE_PASSED";

export interface ResubmissionEligibility {
  eligible: boolean;
  code: ResubmissionEligibilityCode;
  /** Always a SAFE, provider-facing reason — never internal/fraud text. */
  reason: string;
  /** The filing deadline, when a contract submission window applies; else null. */
  deadline: Date | null;
}

function no(code: ResubmissionEligibilityCode, reason: string, deadline: Date | null = null): ResubmissionEligibility {
  return { eligible: false, code, reason, deadline };
}

export const ClaimResubmissionEligibilityService = {
  /**
   * Compute whether `claimId` may be resubmitted by this actor. `at` is injectable so the
   * timezone-boundary of the deadline can be tested deterministically.
   */
  async check(ctx: ProviderAccessContext, claimId: string, at: Date = new Date()): Promise<ResubmissionEligibility> {
    // Provider-scoped load — a foreign/absent claim is an indistinguishable NOT_FOUND.
    const claim = await prisma.claim.findFirst({
      where: { id: claimId, tenantId: ctx.tenantId, providerId: ctx.providerId },
      select: {
        id: true,
        status: true,
        providerBranchId: true,
        declineReasonCode: true,
        dateOfService: true,
        dischargeDate: true,
        supersededByClaimId: true,
        claimLines: { select: { reasonCodeId: true } },
        contract: { select: { submissionWindowDays: true, submissionWindowBasis: true } },
      },
    });
    if (!claim) return no("NOT_FOUND", "Claim not found.");

    // Authorization (the "allowed action" includes the actor being permitted).
    if (!ProviderAccessService.hasPermission(ctx, RESUBMIT_PERMISSION)) {
      return no("FORBIDDEN", "You do not have permission to resubmit claims.");
    }
    if (claim.providerBranchId && !ProviderAccessService.hasBranch(ctx, claim.providerBranchId)) {
      return no("FORBIDDEN", "This claim belongs to a branch outside your access.");
    }

    // Only a declined claim can be resubmitted.
    if (claim.status !== "DECLINED") return no("NOT_DECLINED", "Only a declined claim can be resubmitted.");

    // Current-chain scope / no current resubmission (the claim must be the current head).
    if (claim.supersededByClaimId) return no("ALREADY_RESUBMITTED", "A resubmission of this claim already exists.");
    const successors = await prisma.claim.count({ where: { tenantId: ctx.tenantId, supersedesClaimId: claim.id } });
    if (successors > 0) return no("ALREADY_RESUBMITTED", "A resubmission of this claim already exists.");

    // Reason + resubmissionAllowed (SAFE) — canonical catalog first, legacy decision reason as fallback.
    const lineReasonIds = [...new Set(claim.claimLines.map((l) => l.reasonCodeId).filter((x): x is string => !!x))];
    const lineReasonRows = lineReasonIds.length
      ? await prisma.adjudicationReasonCode.findMany({ where: { id: { in: lineReasonIds } }, select: { resubmissionAllowed: true, providerDescription: true } })
      : [];
    const claimReasonRow = claim.declineReasonCode
      ? await prisma.adjudicationReasonCode.findFirst({ where: { tenantId: ctx.tenantId, code: claim.declineReasonCode }, select: { resubmissionAllowed: true, providerDescription: true } })
      : null;
    const { resubmissionAllowed, safeReason } = resolveResubmissionReason({ lineReasonRows, claimReasonRow, declineReasonCode: claim.declineReasonCode });

    const deadline = resubmissionDeadline({
      windowDays: claim.contract?.submissionWindowDays ?? null,
      basis: (claim.contract?.submissionWindowBasis ?? null) as WindowBasis,
      dateOfService: claim.dateOfService,
      dischargeDate: claim.dischargeDate,
    });

    if (!resubmissionAllowed) return no("REASON_NOT_RESUBMITTABLE", safeReason, deadline);
    if (deadline && at.getTime() > deadline.getTime()) return no("DEADLINE_PASSED", "The submission window for this claim has passed.", deadline);

    return { eligible: true, code: "ELIGIBLE", reason: safeReason, deadline };
  },
} as const;
