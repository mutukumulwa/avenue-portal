import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { ApprovalMatrixService } from "./approval-matrix.service";
import { ApprovalRequestService } from "./approval-request.service";
import { BenefitUsageService } from "./benefit-usage.service";
import { ClaimsService } from "./claims.service";
import { ContractEngine } from "./contract-engine/engine";
import { CostShareResolver } from "./cost-share.service";
import { GLService } from "./gl.service";
import { auditChainService } from "./audit-chain.service";
import { getSystemActorId } from "./system-actor.service";
import { MemberNotificationService } from "./member-notification.service";
import { ClaimControlService } from "./claim-control.service";
import { FxService, BASE_CURRENCY } from "./fx.service";

/**
 * claim-decision.service.ts — the ONE canonical claim decision stack
 * (remediation plan W1.1).
 *
 * Every claim outcome — UI "Submit Decision", tRPC, auto-adjudication, appeals
 * follow-up — flows through `ClaimDecisionService.decide`, which runs, in
 * order:
 *
 *   1. status-transition guard (idempotency — PR-016 #5)
 *   2. practitioner credential gate
 *   3. benefit-in-package gate (PR-016 #2)
 *   4. approval matrix, FX-correct with fail-safe (PR-017)
 *   5. contract price ceiling via the contract engine + FFS fallback (PR-014)
 *   6. attached-PA cover confirmation (PR-015)
 *   then, in ONE transaction:
 *   7. cost-share split, tariff stamping
 *   8. benefit usage upsert + PA hold conversion + PA → UTILISED (PR-016/011)
 *   9. GL posting + self-funded drawdown (PR-018)
 *  10. claim update + AdjudicationLog
 *   and after commit: audit-chain append.
 *
 * The duplicate stacks (`claimAdjudicationService.approveClaim`,
 * `ClaimsService.adjudicateClaim`) are retired; a repo test asserts they no
 * longer exist.
 */

export interface ClaimDecisionInput {
  action: "APPROVED" | "PARTIALLY_APPROVED" | "DECLINED";
  approvedAmount?: number;
  notes?: string;
  declineReasonCode?: string;
  declineNotes?: string;
  reviewerId: string;
  /** Role used for the synchronous matrix role-gate. Omit for system actors. */
  reviewerRole?: string | null;
  /**
   * PR-015: set when the operator explicitly confirmed approving above the
   * attached pre-auth cover. The confirmation text is written to the
   * AdjudicationLog.
   */
  overCoverConfirmation?: string | null;
  /** Skip matrix/SoD (auto-adjudication runs its own policy gates first). */
  systemDecision?: boolean;
  /**
   * PR-025: set when a completed approval-matrix chain is applying the
   * decision it gated. Skips the matrix gate (the chain IS the matrix
   * authorisation) — every other control still runs.
   */
  matrixSatisfied?: boolean;
}

export interface CeilingAssessment {
  /**
   * The enforceable payable ceiling.
   *   number → hard cap the approval is checked against.
   *   null   → genuinely NO contract for this service/date; reviewer judgement
   *            applies (unchanged legacy behaviour).
   * BD-04: when an active contract exists but produced NO enforceable price
   * (uncoded/unlisted lines that resolve to refer-for-review), this is a
   * deterministic `0` with `unpriced: true` — NOT null. That closes the bypass
   * where omitting a CPT flipped the claim to "no ceiling → default full billed".
   */
  ceiling: number | null;
  source: string | null;
  deterministic: boolean;
  enginePayable: number | null;
  contractNumber: string | null;
  /** True when there IS an active contract but nothing on the claim is priced. */
  unpriced?: boolean;
  /**
   * BD-07: true when SOME lines priced but at least one OTHER line resolved to
   * NO enforceable contracted price (uncoded/unlisted → refer / rate-missing)
   * and was therefore EXCLUDED from the ceiling. The ceiling is the sum of the
   * priced lines only; paying the excluded line(s) needs a documented
   * PAY_ABOVE_CONTRACT_RATE override. Distinct from `unpriced` (the all-lines-
   * unpriced, deterministic-0 case). Closes the BD-04/BD-07 bypass where an
   * uncoded line bundled with a priced one rode into the payable ceiling at
   * full billed and was approvable with no override.
   */
  hasUnpricedLines?: boolean;
}

const EPSILON = 0.01;

export class ClaimDecisionService {
  /**
   * PR-014: derive the enforceable payable ceiling for a claim.
   * One engine — the same evaluation the preview panel renders:
   *  - engine-matched claims: Σ payable over non-PENDED lines + Σ billed over
   *    PENDED lines (REFER_FOR_REVIEW / rate-missing stay reviewer judgement);
   *  - no engine contract: the FFS tariff-line ceiling (existing behaviour);
   *  - nothing enforceable: null → "no ceiling — reviewer judgement" label.
   */
  static async assessCeiling(tenantId: string, claimId: string): Promise<CeilingAssessment> {
    const engine = await ContractEngine.evaluateClaimById(tenantId, claimId).catch(() => null);

    if (engine?.matched) {
      let ceiling = 0;
      let anyDeterministic = false;
      let anyUnpriced = false;

      for (const line of engine.lines) {
        if (line.decision === "PENDED") {
          // BD-07: a PENDED line (REFER_FOR_REVIEW / rate-missing) has NO
          // enforceable contracted price, so it must contribute 0 to the
          // ceiling — NOT its full billed amount. Folding billed in let an
          // uncoded line bundled with a priced one be approved at full billed
          // with no PAY_ABOVE_CONTRACT_RATE override (the proven CLM-2026-00295
          // bypass). The unpriced remainder is routed to an explicit override.
          anyUnpriced = true;
        } else {
          ceiling += line.payableAmount;
          anyDeterministic = true;
        }
      }
      // Legacy claims without structured lines: fall back to engine totals.
      if (engine.lines.length === 0) {
        ceiling = engine.totals.payable;
        anyDeterministic = ceiling > 0;
      }
      if (anyDeterministic) {
        return {
          ceiling: Math.round(ceiling * 100) / 100,
          source: `Contract ${engine.contractNumber} (engine-priced)`,
          deterministic: true,
          enginePayable: engine.totals.payable,
          contractNumber: engine.contractNumber,
          hasUnpricedLines: anyUnpriced,
        };
      }
    }

    // FFS fallback: standalone tariff schedule (pre-engine behaviour preserved).
    const { contract, lines: rates } = await ClaimsService.resolveClaimContractRates(tenantId, claimId);
    if (rates.length > 0) {
      let ceiling = 0;
      let hasEnforceableLines = false;
      let anyUnpriced = false;
      for (const r of rates) {
        const cappedQty = r.maxQuantityPerVisit != null ? Math.min(r.quantity, r.maxQuantityPerVisit) : r.quantity;
        if (r.allowedUnit !== null) {
          hasEnforceableLines = true;
          ceiling += r.allowedUnit * cappedQty;
        } else {
          // BD-07: allowedUnit === null means NO_CONTRACT / REFER_FOR_REVIEW —
          // the line has no enforceable contracted price, so it contributes 0
          // to the ceiling (NOT its full billed unitCost). Folding billed in
          // let an uncoded/unlisted line bundled with a priced one be approved
          // at full billed with no override. (PAY_AS_BILLED / DISCOUNT unlisted
          // rules resolve to a NON-null allowedUnit and are unaffected.)
          anyUnpriced = true;
        }
      }
      if (hasEnforceableLines) {
        return {
          ceiling: Math.round(ceiling * 100) / 100,
          source: contract
            ? `Contract ${contract.contractNumber} tariff schedule`
            : "Provider tariff schedule",
          deterministic: true,
          enginePayable: null,
          contractNumber: contract?.contractNumber ?? null,
          hasUnpricedLines: anyUnpriced,
        };
      }

      // BD-04: there IS an active contract but not one line resolved to an
      // enforceable price (missing/altered codes, or unlisted → refer). Do NOT
      // fall through to `null` (which the UI reads as "no contract → default
      // full billed"). Return a deterministic 0 ceiling so any positive approval
      // is blocked until the coding/pricing is corrected or a documented
      // PAY_ABOVE_CONTRACT_RATE override is approved.
      if (contract) {
        return {
          ceiling: 0,
          source: `Contract ${contract.contractNumber} — no enforceable price (uncoded/unlisted line(s))`,
          deterministic: true,
          enginePayable: null,
          contractNumber: contract.contractNumber,
          unpriced: true,
        };
      }
    }

    return { ceiling: null, source: null, deterministic: false, enginePayable: null, contractNumber: null };
  }

  /** True when an APPROVED PAY_ABOVE_CONTRACT_RATE override exists for this claim. */
  static async hasApprovedPriceOverride(tenantId: string, claimId: string): Promise<boolean> {
    const rec = await prisma.overrideRecord.findFirst({
      where: {
        tenantId,
        entityType: "Claim",
        entityId: claimId,
        overrideType: "PAY_ABOVE_CONTRACT_RATE",
        status: "APPROVED",
      },
      select: { id: true },
    });
    return !!rec;
  }

  /**
   * The canonical decision. Throws Error with an operator-readable message on
   * every control violation (the action layer surfaces it verbatim, PR-009).
   */
  static async decide(tenantId: string, claimId: string, decision: ClaimDecisionInput) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      select: {
        id: true, claimNumber: true, status: true, currency: true,
        memberId: true, benefitCategory: true, serviceType: true,
        billedAmount: true, receivedAt: true, adjudicatorId: true,
        attendingDoctor: true, isReimbursement: true,
        preauths: { select: { id: true, preauthNumber: true, approvedAmount: true, estimatedCost: true, utilisedAmount: true, status: true } },
        member: { select: { firstName: true, lastName: true, group: { select: { clientId: true, fundingMode: true, selfFundedAccount: { select: { id: true, balance: true } } } } } },
      },
    });
    if (!claim) throw new Error("Claim not found");

    // 1 ── status transition guard (also the idempotency guard, PR-016 #5)
    if (!["RECEIVED", "CAPTURED", "UNDER_REVIEW"].includes(claim.status)) {
      throw new Error(`Claim cannot be adjudicated in its current status (${claim.status.replace(/_/g, " ")}).`);
    }

    const isApproval = decision.action !== "DECLINED";
    const approvedAmount = isApproval ? (decision.approvedAmount ?? 0) : 0;
    if (isApproval && !(approvedAmount > 0)) {
      throw new Error("Approved amount must be greater than zero.");
    }

    // 2 ── practitioner credential gate
    if (claim.attendingDoctor && isApproval) {
      const practitioner = await prisma.practitioner.findFirst({
        where: { tenantId, licenseNumber: claim.attendingDoctor },
        include: { credentials: { where: { status: "ACTIVE", expiryDate: { gte: new Date() } }, take: 1 } },
      });
      if (practitioner && practitioner.credentials.length === 0) {
        throw new Error(
          `Practitioner license ${claim.attendingDoctor} has no active credentials. ` +
          "Renew the credential in the provider's practitioner registry before approving.",
        );
      }
    }

    // 3 ── benefit-in-package gate (PR-016 #2)
    if (isApproval) {
      const cfg = await BenefitUsageService.resolveConfig(prisma, claim.memberId, claim.benefitCategory);
      if (!cfg) {
        throw new Error(
          `Benefit "${claim.benefitCategory.replace(/_/g, " ")}" is not in the member's package — the claim cannot be approved against it. ` +
          "Correct the benefit category or decline the claim.",
        );
      }
    }

    const clientId = claim.member?.group?.clientId ?? null;

    // 3½ ── OBS-7 fraud approval gate (Outstanding-Conditions Ticket 2).
    // A tenant-controlled money-control: a claim with an unresolved fraud alert
    // at/above the configured severity cannot become payable until the alert is
    // cleared (or a fraud-clearance dual approval completes). Runs before the
    // matrix and every state-changing side effect, so a blocked claim leaves no
    // GL, fund, usage, or notification trace. Auto-adjudication (systemDecision)
    // runs its own `requireCleanFraud` policy gate and is excluded here; the
    // control this adds is human approval FINALISATION.
    if (isApproval && !decision.systemDecision) {
      await ClaimControlService.enforceFraudGate(tenantId, {
        claimId: claim.id,
        claimNumber: claim.claimNumber,
        currency: claim.currency,
        serviceType: claim.serviceType,
        benefitCategory: claim.benefitCategory,
        action: decision.action,
        approvedAmount,
        clientId,
        reviewerId: decision.reviewerId,
      });
    }

    // 4 ── approval matrix, FX-correct (PR-017), fail-closed (PR-023),
    //      completing chains apply the gated decision (PR-025).
    if (isApproval && !decision.systemDecision && !decision.matrixSatisfied) {
      const resolved = await ApprovalMatrixService.resolve(tenantId, {
        actionType: "CLAIM_PAYMENT",
        clientId,
        amount: approvedAmount,
        currency: claim.currency,
        serviceType: claim.serviceType,
        benefitCategory: claim.benefitCategory,
      });
      if (resolved) {
        const amountLabel = `${claim.currency} ${approvedAmount.toLocaleString()}` +
          (resolved.baseAmount != null && claim.currency !== "UGX"
            ? ` (≈ UGX ${Math.round(resolved.baseAmount).toLocaleString()} @ ${resolved.fxRate})`
            : "");

        if (resolved.failSafe && resolved.failSafeReason === "FX_MISSING") {
          // Missing FX rate: route to the most demanding path + exception log.
          await this.logFxException(tenantId, claim.id, claim.claimNumber, claim.currency, decision.reviewerId);
        }

        if (resolved.steps.length > 1 || resolved.failSafe) {
          // PR-025: a fully APPROVED, not-yet-applied chain for this exact
          // decision authorises it — consume the chain and proceed.
          const completed = await prisma.approvalRequest.findFirst({
            where: {
              tenantId, entityType: "Claim", entityId: claimId,
              actionType: "CLAIM_PAYMENT", status: "APPROVED", appliedAt: null,
            },
            orderBy: { updatedAt: "desc" },
            select: { id: true, amount: true },
          });
          const amountMatches = completed?.amount != null &&
            Math.abs(Number(completed.amount) - approvedAmount) < EPSILON;

          if (completed && amountMatches) {
            await prisma.approvalRequest.update({
              where: { id: completed.id },
              data: { appliedAt: new Date() },
            });
            // Chain satisfied — fall through to the remaining gates.
          } else {
            const existing = await prisma.approvalRequest.findFirst({
              where: { tenantId, entityType: "Claim", entityId: claimId, status: { in: ["PENDING", "ESCALATED"] } },
              select: { id: true },
            });
            if (existing) {
              throw new Error(
                `An approval request for this claim is already in progress (Approvals console). ` +
                `It will apply the decision automatically once the final level approves — do not resubmit.`,
              );
            }
            await ApprovalRequestService.create(tenantId, {
              actionType: "CLAIM_PAYMENT",
              entityType: "Claim",
              entityId: claimId,
              makerId: decision.reviewerId,
              clientId,
              amount: approvedAmount,
              currency: claim.currency,
              serviceType: claim.serviceType,
              benefitCategory: claim.benefitCategory,
              // PR-025: persist the gated decision so the completing chain
              // can apply it without operator re-entry.
              payload: {
                action: decision.action,
                approvedAmount,
                notes: decision.notes ?? null,
                overCoverConfirmation: decision.overCoverConfirmation ?? null,
                reviewerId: decision.reviewerId,
                reviewerRole: decision.reviewerRole ?? null,
              },
            });
            if (resolved.failSafe && resolved.failSafeReason === "BAND_UNCOVERED") {
              throw new Error(
                `Approval matrix fail-closed: ${amountLabel} falls outside every configured approval band for this action — ` +
                `it was routed to the most senior configured path. Action it in Approvals (and close the band gap in Settings → Approval Matrix).`,
              );
            }
            throw new Error(
              resolved.failSafe
                ? `No FX rate is in force for ${claim.currency} — the claim was routed to the highest approval path as a fail-safe. Action it in Approvals (and capture the missing rate).`
                : `This claim (${amountLabel}) needs ${resolved.steps.length}-level approval. A request has been opened — the decision will apply automatically when the final level approves.`,
            );
          }
        } else {
          const step = resolved.steps[0];
          if (!ApprovalMatrixService.roleAuthorised(decision.reviewerRole, step.requiredRole)) {
            throw new Error(
              `Approval matrix: this claim (${amountLabel}) requires ${step.requiredRole.replace(/_/g, " ")} or above. ` +
              `Your role (${decision.reviewerRole ?? "unknown"}) is not authorised to approve it.`,
            );
          }
          if (claim.adjudicatorId) {
            ApprovalMatrixService.enforceSegregationOfDuties(claim.adjudicatorId, decision.reviewerId);
          }
        }
      }
    }

    // ── funding model (capitation lines price 0 via the pool) ──
    const { FundingModelService } = await import("./funding-model.service");
    const funding = await FundingModelService.resolveForClaim(tenantId, claimId);
    const capitatedLineIds = new Set(funding.lines.filter((l) => l.capitated).map((l) => l.lineId));

    // ── contract PA-requirement + quantity gates (pre-existing behaviour) ──
    if (isApproval) {
      const { contract, lines: allRates } = await ClaimsService.resolveClaimContractRates(tenantId, claimId);
      const rates = allRates.filter((r) => !capitatedLineIds.has(r.lineId));
      if (rates.length > 0) {
        const paLines = rates.filter((r) => r.requiresPreauth);
        if (paLines.length > 0 && claim.preauths.length === 0) {
          const codes = paLines.map((r) => r.cptCode ?? "uncoded").join(", ");
          throw new Error(
            `Contract ${contract?.contractNumber ?? ""} requires pre-authorization for: ${codes}. Link an approved PA to this claim or decline the line(s).`,
          );
        }
        const qtyLines = rates.filter((r) => r.quantityExceeded);
        if (qtyLines.length > 0) {
          const detail = qtyLines.map((r) => `${r.cptCode ?? "uncoded"} (${r.quantity} > max ${r.maxQuantityPerVisit})`).join(", ");
          throw new Error(`Contract quantity limits exceeded: ${detail}. Reduce the billed quantity or query the provider.`);
        }
      }
    }

    // 5 ── contract price ceiling (PR-014)
    let ceilingNote: string | null = null;
    if (isApproval && !funding.anyCapitated) {
      const assessment = await this.assessCeiling(tenantId, claimId);
      if (assessment.ceiling != null && approvedAmount > assessment.ceiling + EPSILON) {
        const overridden = await this.hasApprovedPriceOverride(tenantId, claimId);
        if (!overridden) {
          // BD-04: unpriced active-contract claim — steer the operator to the
          // real remedy (fix the coding, or a documented override), never a
          // silent full-billed approval.
          if (assessment.unpriced) {
            throw new Error(
              `Contract enforcement: this claim is under an active contract (${assessment.contractNumber ?? ""}) but no line resolved to a contracted price ` +
              `— the service is uncoded or unlisted, so there is no enforceable rate. ` +
              `Correct the CPT/service coding so the tariff can bind, adjust the line to a documented amount, or raise a PAY_ABOVE_CONTRACT_RATE override (requires senior approval). ` +
              `Approving the full billed amount is not permitted.`,
            );
          }
          throw new Error(
            `Contract enforcement: approved amount (${claim.currency} ${approvedAmount.toLocaleString()}) exceeds the payable ceiling of ` +
            `${claim.currency} ${Math.round(assessment.ceiling).toLocaleString()} under ${assessment.source}. ` +
            `Reduce the amount, or raise a PAY_ABOVE_CONTRACT_RATE override from the decision panel (requires senior approval).`,
          );
        }
        ceilingNote = assessment.unpriced
          ? `Approved on an unpriced active-contract claim under an approved PAY_ABOVE_CONTRACT_RATE override (${assessment.source}).`
          : `Approved above contract ceiling ${claim.currency} ${Math.round(assessment.ceiling).toLocaleString()} under an approved PAY_ABOVE_CONTRACT_RATE override.`;
      } else if (assessment.ceiling != null) {
        const shortfall = Number(claim.billedAmount) - assessment.ceiling;
        if (shortfall > EPSILON) {
          ceilingNote = `Contract ceiling ${claim.currency} ${Math.round(assessment.ceiling).toLocaleString()} (${assessment.source}); provider shortfall/write-off ${claim.currency} ${Math.round(shortfall).toLocaleString()} vs billed.`;
        }
      }
    }

    // 6 ── attached-PA cover cap (PR-015): warn + mandatory confirmation.
    // PR-022: the enforceable cover is the REMAINING cover (approved −
    // already-utilised), so multi-claim episodes are capped correctly.
    let notes = decision.notes || undefined;
    if (isApproval && claim.preauths.length > 0) {
      const cover = claim.preauths.reduce(
        (sum, pa) =>
          sum + Math.max(0, Number(pa.approvedAmount ?? pa.estimatedCost ?? 0) - Number(pa.utilisedAmount ?? 0)),
        0,
      );
      if (approvedAmount > cover + EPSILON) {
        if (!decision.overCoverConfirmation) {
          throw new Error(
            `PA cover check: the requested approval (${claim.currency} ${approvedAmount.toLocaleString()}) exceeds the attached pre-auth cover ` +
            `(${claim.currency} ${cover.toLocaleString()}, delta ${claim.currency} ${(approvedAmount - cover).toLocaleString()}). ` +
            `Tick "Approve above pre-auth cover" and give a confirmation note to proceed.`,
          );
        }
        const warn = `PA over-cover confirmed: approved ${approvedAmount.toLocaleString()} vs cover ${cover.toLocaleString()} — ${decision.overCoverConfirmation}`;
        notes = notes ? `${notes} ${warn}` : warn;
      }
    }
    if (funding.anyCapitated) {
      const note = `COVERED_BY_CAPITATION: ${capitatedLineIds.size} line(s) are prepaid via the capitation pool and price at 0.`;
      notes = notes ? `${notes} ${note}` : note;
    }
    if (ceilingNote) notes = notes ? `${notes} ${ceilingNote}` : ceilingNote;

    // 6½ ── OBS-2 Ticket 5: FX snapshot pinned at the decision date.
    // Base currency is UGX. A non-base claim is normalised to base at the
    // decision-date rate; the base amount/rate/date are persisted so GL,
    // settlement and reports never re-infer a historical rate. FAIL CLOSED:
    // a non-base claim with no in-force rate is blocked here — before any GL,
    // fund, usage or notification side effect — rather than silently posting a
    // raw foreign amount into a UGX ledger (the OBS-2 defect). UGX claims keep
    // base == transaction at rate 1.
    const decisionDate = new Date();
    let approvedBaseAmount = approvedAmount;
    let billedBaseAmount: number | null = Number(claim.billedAmount);
    let fxRateToBase = 1;
    let fxRateDate: Date | null = null;
    if (isApproval && claim.currency !== BASE_CURRENCY) {
      const fx = await FxService.normalise(tenantId, approvedAmount, claim.currency, decisionDate);
      if (fx.identity) {
        // identity === true for a non-base currency means no rate was found.
        await this.logFxException(tenantId, claim.id, claim.claimNumber, claim.currency, decision.reviewerId);
        throw new Error(
          `FX fail-closed: no in-force ${claim.currency}→${BASE_CURRENCY} rate on ${decisionDate.toISOString().slice(0, 10)}. ` +
          `Capture the rate in Settings → FX Rates before approving this ${claim.currency} claim — the ledger must not sum foreign amounts as ${BASE_CURRENCY}.`,
        );
      }
      approvedBaseAmount = Math.round(fx.baseAmount * 100) / 100;
      fxRateToBase = fx.rate;
      fxRateDate = decisionDate;
      const billedFx = await FxService.normalise(tenantId, Number(claim.billedAmount), claim.currency, decisionDate);
      billedBaseAmount = Math.round(billedFx.baseAmount * 100) / 100;
    }

    // 7–10 ── the decision transaction
    const account = claim.member?.group?.selfFundedAccount ?? null;
    const isSelfFunded = claim.member?.group?.fundingMode === "SELF_FUNDED" && !!account;

    const updated = await prisma.$transaction(async (tx) => {
      // Cost-share split on the approved amount.
      const costShare = isApproval
        ? await CostShareResolver.applyForClaim(tx as never, claim.memberId, claim.benefitCategory, approvedAmount)
        : null;
      const copay = costShare ? approvedAmount * (costShare.copayPercentage / 100) : 0;
      const memberLiability = copay + (costShare?.memberPays ?? 0);

      // Tariff stamping (audit trail) — contract-aware resolution.
      const resolved = await ClaimsService.resolveClaimContractRates(tenantId, claimId);
      for (const line of resolved.lines) {
        if (line.agreedRate !== null) {
          await tx.claimLine.update({ where: { id: line.lineId }, data: { tariffRate: line.agreedRate } });
        }
      }

      // Benefit usage (PR-016): every approval consumes the net approved
      // amount — PA-attached claims included (their holds are released below).
      if (isApproval) {
        await BenefitUsageService.recordUsage(tx, claim.memberId, claim.benefitCategory, approvedAmount);
      }

      // PA holds + PA status (PR-011/016 #3-4; PR-022 partial utilisation).
      // Each PA is consumed only up to the claim's approved amount:
      //  - fully consumed → hold CONVERTED, PA → UTILISED;
      //  - partially consumed → hold reduced (stays ACTIVE), PA back to
      //    APPROVED with utilisedAmount advanced and detached, so the rest of
      //    the episode (e.g. the surgery after a pre-op consult) still has its
      //    reservation and can attach the PA to the next claim.
      if (isApproval) {
        let toConsume = approvedAmount;
        for (const pa of claim.preauths) {
          if (!["APPROVED", "ATTACHED"].includes(pa.status)) continue;
          const paCover = Number(pa.approvedAmount ?? pa.estimatedCost ?? 0);
          const remainingCover = Math.max(0, paCover - Number(pa.utilisedAmount ?? 0));
          const consumed = Math.min(remainingCover, Math.max(0, toConsume));
          toConsume -= consumed;
          const newUtilised = Number(pa.utilisedAmount ?? 0) + consumed;
          const fullyConsumed = paCover - newUtilised <= EPSILON;

          const hold = await tx.benefitHold.findUnique({ where: { preAuthId: pa.id } });
          if (hold && hold.status === "ACTIVE") {
            const holdRelease = Math.min(Number(hold.heldAmount), consumed);
            const newHeld = Number(hold.heldAmount) - holdRelease;
            if (fullyConsumed || newHeld <= EPSILON) {
              // Convert the whole hold (any sliver left releases with it).
              await tx.benefitHold.update({
                where: { preAuthId: pa.id },
                data: { status: "CONVERTED", convertedToClaimId: claimId, releasedAt: new Date() },
              });
              await BenefitUsageService.releaseHold(tx, hold.memberId, hold.benefitCategory, Number(hold.heldAmount));
            } else {
              await tx.benefitHold.update({
                where: { preAuthId: pa.id },
                data: { heldAmount: newHeld },
              });
              await BenefitUsageService.releaseHold(tx, hold.memberId, hold.benefitCategory, holdRelease);
            }
          }

          await tx.preAuthorization.update({
            where: { id: pa.id },
            data: fullyConsumed
              ? { status: "UTILISED", utilisedAmount: newUtilised }
              : { status: "APPROVED", utilisedAmount: newUtilised, claimId: null, attachedAt: null },
          });
        }
      } else if (claim.preauths.length > 0) {
        // DECLINED: hold stays ACTIVE — detach + back to APPROVED for
        // resubmission (PR-016 D4).
        await tx.preAuthorization.updateMany({
          where: { claimId, status: { in: ["APPROVED", "ATTACHED"] } },
          data: { status: "APPROVED", claimId: null, attachedAt: null },
        });
      }

      const row = await tx.claim.update({
        where: { id: claimId },
        data: {
          status: decision.action,
          approvedAmount: isApproval ? approvedAmount : 0,
          // OBS-2 Ticket 5: base-currency snapshot (UGX at decision-date rate).
          baseCurrency: BASE_CURRENCY,
          approvedBaseAmount: isApproval ? approvedBaseAmount : 0,
          billedBaseAmount,
          fxRateToBase,
          fxRateDate,
          copayAmount: isApproval ? copay : 0,
          memberLiability: isApproval ? memberLiability : 0,
          costShareDeductible: costShare?.deductibleApplied ?? 0,
          costShareCoInsurance: costShare?.coInsuranceApplied ?? 0,
          assignedReviewerId: decision.reviewerId,
          adjudicatorId: claim.adjudicatorId ?? decision.reviewerId,
          decidedAt: new Date(),
          turnaroundDays: Math.ceil((Date.now() - claim.receivedAt.getTime()) / (1000 * 3600 * 24)),
          declineReasonCode: decision.declineReasonCode,
          declineNotes: decision.declineNotes,
          adjudicationLogs: {
            create: {
              userId: decision.reviewerId,
              action: decision.action,
              fromStatus: claim.status,
              toStatus: decision.action,
              amount: approvedAmount,
              notes: notes || decision.declineNotes,
            },
          },
        },
      });

      // GL posting (PR-018 #1): inside the decision transaction, no swallow.
      // OBS-2 Ticket 6: the ledger is kept in base currency (UGX). A non-base
      // claim posts its base-normalised amount (approvedBaseAmount), never the
      // raw transaction amount — so KES + UGX claims can never be summed as one.
      if (isApproval && approvedAmount > 0) {
        const coTx = await tx.coContributionTransaction.findUnique({
          where: { claimId },
          select: { finalAmount: true },
        });
        const coBase = coTx ? Math.round(Number(coTx.finalAmount) * fxRateToBase * 100) / 100 : 0;
        await GLService.postClaimApproved(tenantId, {
          sourceId: claimId,
          reference: claim.claimNumber,
          amount: approvedBaseAmount,
          coContributionAmount: coBase,
          postedById: decision.reviewerId,
          tx,
        });

        // Self-funded scheme drawdown (PR-018 D2) — same transaction. The fund
        // is denominated in base currency, so it draws down the base amount.
        if (isSelfFunded && account) {
          const newBalance = Number(account.balance) - approvedBaseAmount;
          await tx.selfFundedAccount.update({
            where: { id: account.id },
            data: { balance: newBalance, totalClaims: { increment: approvedBaseAmount } },
          });
          await tx.fundTransaction.create({
            data: {
              tenantId,
              selfFundedAccountId: account.id,
              claimId,
              type: "CLAIM_DEDUCTION",
              amount: approvedBaseAmount,
              balanceAfter: newBalance,
              description: `Claim ${claim.claimNumber} — ${decision.action.replace(/_/g, " ").toLowerCase()}`,
              postedById: decision.reviewerId,
            },
          });
        }
      }

      return row;
    });

    // Zero the capitated lines + tag the pool on the decided claim.
    if (isApproval) {
      await FundingModelService.applyToDecidedClaim(tenantId, claimId, funding);
    }

    // Audit chain (hash-linked) after commit.
    await auditChainService.append({
      actorId: decision.reviewerId,
      action: `CLAIM:${decision.action}`,
      module: "CLAIMS",
      entityType: "Claim",
      entityId: claimId,
      payload: { approvedAmount, action: decision.action, currency: claim.currency },
      tenantId,
      description: `Claim ${claim.claimNumber} ${decision.action.toLowerCase().replace(/_/g, " ")} — ${claim.currency} ${approvedAmount.toLocaleString()}`,
    });

    // Member notification — decision outcome. Canonical path, so this covers
    // manual "Submit Decision", tRPC and auto-adjudication alike. Never throws.
    {
      const patientName = claim.member ? `${claim.member.firstName} ${claim.member.lastName}` : "Member";
      const statusWord =
        decision.action === "APPROVED" ? "approved"
        : decision.action === "PARTIALLY_APPROVED" ? "partially approved"
        : "declined";
      await MemberNotificationService.notifyForClaim({
        tenantId,
        memberId: claim.memberId,
        type: "CLAIM_STATUS",
        priority: decision.action === "DECLINED" ? "HIGH" : "NORMAL",
        title: `Claim ${statusWord}`,
        body: isApproval
          ? `${patientName} — claim ${claim.claimNumber} ${statusWord} for ${claim.currency} ${approvedAmount.toLocaleString()}.`
          : `${patientName} — claim ${claim.claimNumber} was declined${decision.declineReasonCode ? ` (reason: ${decision.declineReasonCode})` : ""}.`,
        href: "/member/utilization",
        metadata: { claimId: claim.id, claimNumber: claim.claimNumber, event: decision.action },
      });
    }

    return updated;
  }

  /**
   * Void an approved-not-settled claim (PR-016 #6 / PR-018 #4): compensating
   * usage decrement + reversing JE + status VOID, one transaction.
   */
  static async voidClaim(
    tenantId: string,
    claimId: string,
    opts: { actorId: string; reason: string },
  ) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      select: {
        id: true, claimNumber: true, status: true, currency: true,
        memberId: true, benefitCategory: true, approvedAmount: true,
        approvedBaseAmount: true, fxRateToBase: true,
        settlementBatchId: true,
        member: { select: { group: { select: { fundingMode: true, selfFundedAccount: { select: { id: true, balance: true } } } } } },
      },
    });
    if (!claim) throw new Error("Claim not found");
    if (!["APPROVED", "PARTIALLY_APPROVED"].includes(claim.status)) {
      throw new Error(`Only APPROVED/PARTIALLY APPROVED claims can be voided (current: ${claim.status.replace(/_/g, " ")}).`);
    }
    if (claim.settlementBatchId) {
      throw new Error("Claim is already queued/settled in a settlement batch — reverse it through settlement, not a void.");
    }
    const amount = Number(claim.approvedAmount);
    // OBS-2 Ticket 6: the reversal must mirror the approval JE, which posted the
    // base amount. Older claims (pre-snapshot) have approvedBaseAmount 0 → fall
    // back to the transaction amount so their reversal still balances.
    const baseAmount = Number(claim.approvedBaseAmount) || amount;
    const rate = claim.fxRateToBase != null ? Number(claim.fxRateToBase) : 1;

    const updated = await prisma.$transaction(async (tx) => {
      if (amount > 0) {
        await BenefitUsageService.reverseUsage(tx, claim.memberId, claim.benefitCategory, amount);
        const coTx = await tx.coContributionTransaction.findUnique({
          where: { claimId },
          select: { finalAmount: true },
        });
        const coBase = coTx ? Math.round(Number(coTx.finalAmount) * rate * 100) / 100 : 0;
        await GLService.postClaimVoidReversal(tenantId, {
          sourceId: claimId,
          reference: claim.claimNumber,
          amount: baseAmount,
          coContributionAmount: coBase,
          postedById: opts.actorId,
          tx,
        });
        const account = claim.member?.group?.selfFundedAccount;
        if (claim.member?.group?.fundingMode === "SELF_FUNDED" && account) {
          const newBalance = Number(account.balance) + baseAmount;
          await tx.selfFundedAccount.update({
            where: { id: account.id },
            data: { balance: newBalance, totalClaims: { decrement: baseAmount } },
          });
          await tx.fundTransaction.create({
            data: {
              tenantId,
              selfFundedAccountId: account.id,
              claimId,
              type: "REFUND",
              amount: baseAmount,
              balanceAfter: newBalance,
              description: `Claim ${claim.claimNumber} voided — drawdown reversed`,
              postedById: opts.actorId,
            },
          });
        }
      }
      return tx.claim.update({
        where: { id: claimId },
        data: {
          status: "VOID",
          adjudicationLogs: {
            create: {
              userId: opts.actorId,
              action: "VOID",
              fromStatus: claim.status,
              toStatus: "VOID",
              amount,
              notes: `Voided: ${opts.reason}`,
            },
          },
        },
      });
    });

    await auditChainService.append({
      actorId: opts.actorId,
      action: "CLAIM:VOID",
      module: "CLAIMS",
      entityType: "Claim",
      entityId: claimId,
      payload: { amount, reason: opts.reason },
      tenantId,
      description: `Claim ${claim.claimNumber} voided — usage and GL reversed (${claim.currency} ${amount.toLocaleString()})`,
    });

    return updated;
  }

  /** PR-017 #3: ExceptionLog entry when a decision hits a missing FX rate. */
  private static async logFxException(
    tenantId: string,
    claimId: string,
    claimNumber: string,
    currency: string,
    raisedById: string,
  ) {
    const actorId = raisedById || (await getSystemActorId(tenantId));
    await prisma.exceptionLog
      .create({
        data: {
          tenantId,
          entityType: "CLAIM",
          entityId: claimId,
          entityRef: claimNumber,
          claimId,
          exceptionCode: "OTHER",
          reason: `FX rate missing for ${currency} at decision time — approval routed to fail-safe path (PR-017).`,
          raisedById: actorId,
        },
      })
      .catch(() => undefined); // exception logging must never block the decision
  }
}
