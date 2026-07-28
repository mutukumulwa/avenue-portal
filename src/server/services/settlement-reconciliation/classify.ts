import Decimal from "decimal.js";

/**
 * PNOS F6.9 — settlement reconciliation classifier (pure; no I/O).
 *
 * Independent verification of the I5 chain for one settlement batch/currency —
 * recomputed from raw aggregates, NOT the read model, so it can catch drift the
 * read model would inherit:
 *
 *   Σ remittance line payable = Σ claim payable = stored batch total
 *     = approved voucher amount = Σ successful (SUCCEEDED) disbursement
 *
 * plus the I6 base axis. It NEVER mutates anything (spec step 6) — it only
 * classifies the exact mismatch type. Under-disbursement is informational (a
 * settled batch may not be fully paid yet); only OVER-disbursement is a leak.
 */

const D = (v: unknown): Decimal => new Decimal(v == null ? 0 : typeof v === "object" ? (v as { toString(): string }).toString() : (v as Decimal.Value));
const money = (v: unknown): string => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
const eq2 = (a: unknown, b: unknown): boolean =>
  D(a).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).equals(D(b).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));

export type ReconciliationExceptionType =
  | "LINE_HEADER_MISMATCH" // Σ line payable ≠ Σ claim payable (D-1)
  | "CLAIM_BATCH_MISMATCH" // Σ claim payable ≠ stored batch total
  | "VOUCHER_MISMATCH" // batch total ≠ voucher amount
  | "MISSING_VOUCHER" // a SETTLED batch has no voucher
  | "OVER_DISBURSED" // Σ successful disbursement > batch total
  | "BASE_GL_MISMATCH"; // Σ claim base ≠ stored batch base (I6)

export interface ReconciliationException {
  type: ReconciliationExceptionType;
  detail: string;
  expected: string;
  actual: string;
}

export interface BatchReconFacts {
  batchId: string;
  currency: string;
  baseCurrency: string;
  hasVoucher: boolean;
  batchTotal: unknown;
  batchBaseTotal: unknown;
  voucherTotal: unknown; // null when no voucher
  sumClaimApproved: unknown;
  sumClaimBase: unknown;
  sumLineApproved: unknown;
  sumSuccessfulDisbursement: unknown; // Σ SUCCEEDED
}

export interface BatchReconResult {
  batchId: string;
  currency: string;
  legs: {
    lineToClaim: boolean;
    claimToBatch: boolean;
    batchToVoucher: boolean | null; // null when no voucher (a MISSING_VOUCHER exception is raised)
    baseClaimToBatch: boolean;
  };
  disbursement: {
    successful: string;
    remaining: string; // batch total − successful (≥ 0 shown; negative ⇒ over-disbursed)
    fullyDisbursed: boolean;
    overDisbursed: boolean;
  };
  i5Holds: boolean; // line=claim=batch=voucher (the accounting spine)
  exceptions: ReconciliationException[];
  reconciled: boolean; // no exceptions
}

export function classifyBatchReconciliation(f: BatchReconFacts): BatchReconResult {
  const exceptions: ReconciliationException[] = [];

  const lineToClaim = eq2(f.sumLineApproved, f.sumClaimApproved);
  if (!lineToClaim) {
    exceptions.push({ type: "LINE_HEADER_MISMATCH", detail: `Σ line payable ≠ Σ claim payable for batch ${f.batchId}`, expected: money(f.sumClaimApproved), actual: money(f.sumLineApproved) });
  }

  const claimToBatch = eq2(f.sumClaimApproved, f.batchTotal);
  if (!claimToBatch) {
    exceptions.push({ type: "CLAIM_BATCH_MISMATCH", detail: `Σ claim payable ≠ stored batch total for batch ${f.batchId}`, expected: money(f.batchTotal), actual: money(f.sumClaimApproved) });
  }

  let batchToVoucher: boolean | null = null;
  if (!f.hasVoucher) {
    exceptions.push({ type: "MISSING_VOUCHER", detail: `Settled batch ${f.batchId} has no payment voucher`, expected: money(f.batchTotal), actual: "0.00" });
  } else {
    batchToVoucher = eq2(f.batchTotal, f.voucherTotal);
    if (!batchToVoucher) {
      exceptions.push({ type: "VOUCHER_MISMATCH", detail: `Stored batch total ≠ voucher amount for batch ${f.batchId}`, expected: money(f.batchTotal), actual: money(f.voucherTotal) });
    }
  }

  const baseClaimToBatch = eq2(f.sumClaimBase, f.batchBaseTotal);
  if (!baseClaimToBatch) {
    exceptions.push({ type: "BASE_GL_MISMATCH", detail: `Σ claim base ≠ stored batch base total for batch ${f.batchId}`, expected: money(f.batchBaseTotal), actual: money(f.sumClaimBase) });
  }

  const successful = D(f.sumSuccessfulDisbursement);
  const batchTotal = D(f.batchTotal);
  const overDisbursed = successful.greaterThan(batchTotal);
  if (overDisbursed) {
    exceptions.push({ type: "OVER_DISBURSED", detail: `Σ successful disbursement exceeds batch total for batch ${f.batchId}`, expected: money(batchTotal), actual: money(successful) });
  }
  const remaining = batchTotal.minus(successful); // ≥0 ⇒ still owed; <0 ⇒ over (already flagged)

  const i5Holds = lineToClaim && claimToBatch && (batchToVoucher ?? false);

  return {
    batchId: f.batchId,
    currency: f.currency,
    legs: { lineToClaim, claimToBatch, batchToVoucher, baseClaimToBatch },
    disbursement: {
      successful: money(successful),
      remaining: money(remaining),
      fullyDisbursed: eq2(successful, batchTotal),
      overDisbursed,
    },
    i5Holds,
    exceptions,
    reconciled: exceptions.length === 0,
  };
}
