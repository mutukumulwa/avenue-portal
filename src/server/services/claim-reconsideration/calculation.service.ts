import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import type { ReconsiderationStatus } from "@prisma/client";
import { ContractEngine } from "@/server/services/contract-engine/engine";
import { reconsiderationMaxIncrement } from "./policy";
import {
  RECONSIDERATION_REVIEWER_ROLES,
  ReconsiderationReviewError,
  type ReconsiderationReviewerActor,
} from "./review.service";

/**
 * PNOS F5.15 — reconsideration maximum-delta calculation (READ-ONLY).
 *
 * For each disputed line: re-price the disputed claim through the CANONICAL contract engine
 * (never a copy) at the claim's governing service date, sum ALL prior linked approved/paid (the
 * original settlement + every earlier ACCEPTED supplemental award, so nothing is allowed twice),
 * and return max(0, corrected full entitlement − prior) in exact Decimal. Captures the pricing
 * version reference + a safe explanation. Mutates NOTHING — no money, no status, no line write
 * (F5.16 is the outcome writer). Deterministic: identical inputs ⇒ identical output.
 */

/** Prior reconsideration awards that count as already-committed entitlement (accepted outcomes). */
const ACCEPTED_RECONSIDERATION_STATUSES: ReconsiderationStatus[] = ["ACCEPTED", "PARTIALLY_ACCEPTED"];

/** A line the engine could not deterministically price carries payableAmount === null. */
export interface RepricedLine {
  claimLineId: string;
  payableAmount: number | null;
  source?: string | null;
}
export interface RepriceResult {
  matched: boolean;
  contractId: string | null;
  contractVersionId: string | null;
  lines: RepricedLine[];
}

/** Repricing port — defaults to the canonical contract engine (read-only). Injectable so the
 *  calculation is tested deterministically without standing up a full tariff fixture. */
export type ReconsiderationRepricer = (tenantId: string, claimId: string) => Promise<RepriceResult>;

/** Default: call the canonical engine and interpret its verdict. A PENDED line (or an unmatched
 *  claim) is NOT deterministically priced ⇒ payableAmount null; a priced/declined line has a
 *  definite payable. No copy of pricing/cost-share/benefit logic — the engine owns it. */
const canonicalRepricer: ReconsiderationRepricer = async (tenantId, claimId) => {
  const r = await ContractEngine.evaluateClaimById(tenantId, claimId);
  if (!r || !r.matched) {
    return { matched: false, contractId: r?.contractId ?? null, contractVersionId: r?.contractVersionId ?? null, lines: [] };
  }
  return {
    matched: true,
    contractId: r.contractId,
    contractVersionId: r.contractVersionId,
    lines: r.lines.map((l) => ({
      claimLineId: l.lineId,
      payableAmount: l.decision === "PENDED" ? null : l.payableAmount,
      source: l.payableSource ?? l.matchedRuleType ?? null,
    })),
  };
};

export interface ReconsiderationLineDelta {
  reconsiderationLineId: string;
  claimLineId: string;
  /** Corrected full entitlement from the canonical engine; null ⇒ not deterministically priced. */
  correctedEntitlement: string | null;
  priorApproved: string;
  priorPaid: string;
  /** max(0, corrected − max(priorApproved, priorPaid)); 0 when non-deterministic. */
  maxIncrement: string;
  deterministic: boolean;
  /** Safe, human-readable provenance for the reviewer. */
  explanation: string;
  pricingSource: string | null;
}

export interface ReconsiderationDeltaResult {
  reconsiderationId: string;
  claimId: string;
  currency: string;
  /** Every disputed line was deterministically priced by the engine. */
  deterministic: boolean;
  contractId: string | null;
  contractVersionId: string | null;
  lines: ReconsiderationLineDelta[];
  /** Σ of the per-line maxIncrement — the supplemental ceiling (§7.8). */
  totalMaxIncrement: string;
}

function assertReviewer(actor: ReconsiderationReviewerActor): void {
  if (!(RECONSIDERATION_REVIEWER_ROLES as readonly string[]).includes(actor.role)) {
    throw new ReconsiderationReviewError("FORBIDDEN", "You do not have permission to review reconsiderations.");
  }
}

const dec = (v: unknown): Decimal => new Decimal((v as { toString(): string }).toString());
const money = (d: Decimal): string => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

export const ReconsiderationCalculationService = {
  /**
   * Corrected full entitlement, prior approved/paid, and the maximum positive delta per disputed
   * line. Read-only: no money, status, or line is written. `opts.reprice` overrides the canonical
   * engine port (tests inject a deterministic stub).
   */
  async computeMaxDelta(
    actor: ReconsiderationReviewerActor,
    reconsiderationId: string,
    opts: { reprice?: ReconsiderationRepricer } = {},
  ): Promise<ReconsiderationDeltaResult> {
    assertReviewer(actor);

    // 1. The case + its disputed lines (frozen claim-line refs), tenant-scoped.
    const rc = await prisma.claimReconsideration.findFirst({
      where: { id: reconsiderationId, tenantId: actor.tenantId },
      select: { id: true, claimId: true, currency: true, lines: { select: { id: true, claimLineId: true } } },
    });
    if (!rc) throw new ReconsiderationReviewError("NOT_FOUND", "Reconsideration not found.");

    // 2. The disputed claim's live lines (prior-approved base) + paid status. D13: read-only.
    const claim = await prisma.claim.findFirst({
      where: { id: rc.claimId, tenantId: actor.tenantId },
      select: { id: true, status: true, claimLines: { select: { id: true, approvedAmount: true } } },
    });
    if (!claim) throw new ReconsiderationReviewError("NOT_FOUND", "Claim not found.");
    const approvedByLine = new Map(claim.claimLines.map((l) => [l.id, dec(l.approvedAmount)]));
    const claimPaid = claim.status === "PAID";

    // 3. Prior ACCEPTED supplemental awards per line — across every OTHER reconsideration on this
    //    claim — so an amount already awarded is never allowed a second time (§7.8, no double pay).
    const priorAwardRows = await prisma.claimReconsiderationLine.findMany({
      where: {
        reconsideration: { tenantId: actor.tenantId, claimId: rc.claimId, id: { not: rc.id }, status: { in: ACCEPTED_RECONSIDERATION_STATUSES } },
      },
      select: { claimLineId: true, awardedIncrement: true },
    });
    const priorAwardByLine = new Map<string, Decimal>();
    for (const row of priorAwardRows) {
      priorAwardByLine.set(row.claimLineId, (priorAwardByLine.get(row.claimLineId) ?? new Decimal(0)).plus(dec(row.awardedIncrement)));
    }

    // 4. Re-price through the canonical engine (read-only) at the claim's service date.
    const reprice = opts.reprice ?? canonicalRepricer;
    const engine = await reprice(actor.tenantId, rc.claimId);
    const engineLineById = new Map(engine.lines.map((l) => [l.claimLineId, l]));

    // 5. Per-line delta (exact Decimal).
    const lines: ReconsiderationLineDelta[] = [];
    let total = new Decimal(0);
    let allDeterministic = rc.lines.length > 0;
    for (const rl of rc.lines) {
      const base = approvedByLine.get(rl.claimLineId) ?? new Decimal(0);
      const priorAward = priorAwardByLine.get(rl.claimLineId) ?? new Decimal(0);
      const priorApproved = base.plus(priorAward);
      const priorPaid = (claimPaid ? base : new Decimal(0)).plus(priorAward);

      const el = engineLineById.get(rl.claimLineId);
      const deterministic = engine.matched && !!el && el.payableAmount != null;
      let correctedEntitlement: Decimal | null = null;
      let maxIncrement = new Decimal(0);
      let explanation: string;
      let pricingSource: string | null = null;

      if (deterministic && el && el.payableAmount != null) {
        correctedEntitlement = new Decimal(el.payableAmount);
        maxIncrement = reconsiderationMaxIncrement({ correctedEntitlement, alreadyApproved: priorApproved, alreadyPaid: priorPaid });
        pricingSource = el.source ?? null;
        const prior = Decimal.max(priorApproved, priorPaid);
        explanation = maxIncrement.isZero()
          ? `Corrected entitlement ${money(correctedEntitlement)} does not exceed prior ${money(prior)} — no additional amount.`
          : `Corrected entitlement ${money(correctedEntitlement)} less prior ${money(prior)} ⇒ up to ${money(maxIncrement)} more.`;
      } else {
        allDeterministic = false;
        explanation = engine.matched
          ? "This line is not deterministically priced (pending) — reviewer judgment required."
          : "No contract deterministically prices this claim — reviewer judgment required.";
      }

      total = total.plus(maxIncrement);
      lines.push({
        reconsiderationLineId: rl.id,
        claimLineId: rl.claimLineId,
        correctedEntitlement: correctedEntitlement != null ? money(correctedEntitlement) : null,
        priorApproved: money(priorApproved),
        priorPaid: money(priorPaid),
        maxIncrement: money(maxIncrement),
        deterministic,
        explanation,
        pricingSource,
      });
    }

    return {
      reconsiderationId: rc.id,
      claimId: rc.claimId,
      currency: rc.currency,
      deterministic: allDeterministic,
      contractId: engine.contractId,
      contractVersionId: engine.contractVersionId,
      lines,
      totalMaxIncrement: money(total),
    };
  },
} as const;
