import Decimal from "decimal.js";
import { LEGACY_DECLINE_RESUBMISSION } from "../claim-resubmission/policy";

/**
 * PNOS F6.2 — pure remittance projection + conservation (no I/O).
 *
 * Implements the F6.1 frozen field dictionary (docs/provider-network-os/
 * REMITTANCE_FIELD_DICTIONARY.md). Every amount is read from a STORED snapshot
 * and rendered exactly — never recomputed from a live tariff/FX/contract (D15).
 * All arithmetic is decimal.js; money crosses the boundary as a HALF_UP 2dp
 * string (D25 / §5). Provider-safe by construction: the "Safe? = N" columns
 * (internalDescription, declineNotes, ruleTrace, GL ids, maker/checker, fraud
 * signals, contractedRate) are simply never read here.
 */

// ── money helpers ────────────────────────────────────────────────────────────
/** Coerce a Prisma.Decimal | number | string | null to decimal.js, treating null as 0. */
export const toDecimal = (v: unknown): Decimal =>
  new Decimal(v == null ? 0 : typeof v === "object" ? (v as { toString(): string }).toString() : (v as Decimal.Value));
/** HALF_UP 2dp display string (the only place precision is pinned — §5, D-8). */
export const money = (v: unknown): string => toDecimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
/** Exact 2dp equality used for every conservation leg. */
const eq2 = (a: unknown, b: unknown): boolean =>
  toDecimal(a).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).equals(toDecimal(b).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));

// ── provider-safe reason (§7) ────────────────────────────────────────────────
export interface RemittanceReason {
  code: string;
  text: string; // provider-safe (providerDescription / legacy safeReason)
  remedy: string | null;
  resubmissionAllowed: boolean;
  category: string | null;
  severity: string | null;
}

/** A structured line reason (populated in the auto path) → safe projection. */
export interface LineReasonRow {
  code: string;
  category: string;
  providerDescription: string;
  remedy: string | null;
  resubmissionAllowed: boolean;
  defaultSeverity: string;
}

export function safeLineReason(row: LineReasonRow | null): RemittanceReason | null {
  if (!row) return null;
  return {
    code: row.code,
    text: row.providerDescription, // NEVER internalDescription (§7 / D18)
    remedy: row.remedy ?? null,
    resubmissionAllowed: row.resubmissionAllowed,
    category: row.category ?? null,
    severity: row.defaultSeverity ?? null,
  };
}

/**
 * Claim-level decline reason (enum Claim.declineReasonCode) → safe text, reusing
 * the F5.9 LEGACY_DECLINE_RESUBMISSION map. FRAUD_SUSPECTED is already neutralised
 * there (never discloses the fraud rationale, D18). Gap D-10: human declines may
 * carry only free text and no code — those resolve to the generic safe fallback.
 */
const DEFAULT_CLAIM_DECLINE = "This claim was declined — contact the payer to discuss.";
export function safeClaimDeclineReason(declineReasonCode: string | null): RemittanceReason | null {
  if (!declineReasonCode) return null;
  const code = declineReasonCode.trim().toUpperCase();
  const m = LEGACY_DECLINE_RESUBMISSION[code];
  return {
    code,
    text: m?.safeReason ?? DEFAULT_CLAIM_DECLINE,
    remedy: null,
    resubmissionAllowed: m?.resubmissionAllowed ?? false,
    category: null,
    severity: null,
  };
}

// ── line projection (§4.4) ───────────────────────────────────────────────────
export interface RemittanceLineInput {
  id: string;
  lineNumber: number;
  description: string;
  cptCode: string | null;
  quantity: number;
  billedAmount: unknown;
  contractedAmount: unknown; // nullable
  disallowedAmount: unknown;
  memberLiability: unknown;
  providerWriteOff: unknown;
  approvedAmount: unknown; // Track A line payable (spine)
  payerLiability: unknown; // Track B engine payable (provenance)
  reasonCode: LineReasonRow | null;
}

export interface RemittanceLine {
  id: string;
  lineNumber: number;
  description: string;
  cptCode: string | null;
  quantity: number;
  billed: string;
  contractedAllowed: string | null;
  disallowed: string;
  memberShare: string;
  providerWriteoff: string;
  approvedPayable: string; // authoritative (Track A)
  enginePayable: string; // provenance (Track B) — may diverge (D-1)
  paid: string; // derived (§5): = approvedPayable when the claim is PAID, else 0
  reason: RemittanceReason | null;
}

export function projectLine(line: RemittanceLineInput, claimIsPaid: boolean): RemittanceLine {
  return {
    id: line.id,
    lineNumber: line.lineNumber,
    description: line.description,
    cptCode: line.cptCode,
    quantity: line.quantity,
    billed: money(line.billedAmount),
    contractedAllowed: line.contractedAmount == null ? null : money(line.contractedAmount),
    disallowed: money(line.disallowedAmount),
    memberShare: money(line.memberLiability),
    providerWriteoff: money(line.providerWriteOff),
    approvedPayable: money(line.approvedAmount),
    enginePayable: money(line.payerLiability),
    paid: claimIsPaid ? money(line.approvedAmount) : "0.00",
    reason: safeLineReason(line.reasonCode),
  };
}

// ── claim projection (§4.3) ──────────────────────────────────────────────────
export interface RemittanceClaimInput {
  id: string;
  claimNumber: string;
  status: string;
  currency: string;
  baseCurrency: string;
  serviceType: string;
  dateOfService: Date | null;
  billedAmount: unknown;
  approvedAmount: unknown;
  paidAmount: unknown;
  memberLiability: unknown;
  approvedBaseAmount: unknown;
  billedBaseAmount: unknown; // nullable
  declineReasonCode: string | null;
  submissionType: string;
  chainRootClaimId: string | null;
  supersedesClaimId: string | null;
  supersededByClaimId: string | null;
  member: { memberNumber: string; firstName: string; lastName: string } | null;
  lines: RemittanceLineInput[];
}

export interface RemittanceClaim {
  id: string;
  claimNumber: string;
  status: string;
  currency: string;
  baseCurrency: string;
  serviceType: string;
  dateOfService: Date | null;
  member: { memberNumber: string; name: string } | null;
  billed: string;
  approved: string; // payable — authoritative (Track A)
  paid: string;
  memberShare: string;
  approvedBase: string;
  billedBase: string | null;
  declineReason: RemittanceReason | null;
  lineage: {
    submissionType: string;
    chainRootClaimId: string | null;
    supersedesClaimId: string | null;
    supersededByClaimId: string | null;
    isSupplemental: boolean;
  };
  lines: RemittanceLine[];
  /** R-1 / D-1: approved(header) − Σ line approved. "0.00" ⇒ lines reconcile. */
  lineResidual: string;
  linesReconciled: boolean;
}

export function projectClaim(claim: RemittanceClaimInput): RemittanceClaim {
  const isPaid = claim.status === "PAID";
  const lines = claim.lines.map((l) => projectLine(l, isPaid));
  const sumLineApproved = claim.lines.reduce((s, l) => s.plus(toDecimal(l.approvedAmount)), new Decimal(0));
  const residual = toDecimal(claim.approvedAmount).minus(sumLineApproved).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return {
    id: claim.id,
    claimNumber: claim.claimNumber,
    status: claim.status,
    currency: claim.currency,
    baseCurrency: claim.baseCurrency,
    serviceType: claim.serviceType,
    dateOfService: claim.dateOfService,
    member: claim.member
      ? { memberNumber: claim.member.memberNumber, name: `${claim.member.firstName} ${claim.member.lastName}`.trim() }
      : null,
    billed: money(claim.billedAmount),
    approved: money(claim.approvedAmount),
    paid: money(claim.paidAmount),
    memberShare: money(claim.memberLiability),
    approvedBase: money(claim.approvedBaseAmount),
    billedBase: claim.billedBaseAmount == null ? null : money(claim.billedBaseAmount),
    declineReason: safeClaimDeclineReason(claim.declineReasonCode),
    lineage: {
      submissionType: claim.submissionType,
      chainRootClaimId: claim.chainRootClaimId,
      supersedesClaimId: claim.supersedesClaimId,
      supersededByClaimId: claim.supersededByClaimId,
      // A reconsideration/correction/resubmission child is a supplemental settlement line (§6).
      isSupplemental: claim.submissionType !== "ORIGINAL",
    },
    lines,
    lineResidual: residual.toFixed(2),
    linesReconciled: residual.isZero(),
  };
}

// ── batch header projection (§4.1/§4.2) ──────────────────────────────────────
export interface RemittanceBatchInput {
  id: string;
  cycleMonth: number;
  cycleYear: number;
  sequence: number;
  currency: string;
  baseCurrency: string;
  status: string;
  settledAt: Date | null;
  claimCount: number;
  totalAmount: unknown;
  baseTotalAmount: unknown;
}
export interface RemittanceVoucherInput {
  voucherNumber: string;
  totalAmount: unknown;
  baseTotalAmount: unknown;
  status: string;
  processedAt: Date | null;
}

export interface RemittanceBatchHeader {
  id: string;
  cycleMonth: number;
  cycleYear: number;
  sequence: number;
  currency: string;
  baseCurrency: string;
  status: string;
  settledAt: Date | null;
  claimCount: number;
  totalAmount: string;
  /** Base total is only meaningful once SETTLED (D-9: 0 before mark-paid). */
  baseTotalAmount: string | null;
  voucher: {
    voucherNumber: string;
    totalAmount: string;
    baseTotalAmount: string;
    status: string;
    processedAt: Date | null;
  } | null;
  /** D-7 / D16: actual disbursement facts do not exist yet. Never claim a bank fact we don't have. */
  disbursement: null;
  paymentFactsRecorded: false;
  paymentFactsNote: string;
}

const SETTLED = "SETTLED";
const NO_DISBURSEMENT_NOTE =
  "Actual disbursement facts (method, bank reference, value date) are not yet recorded; “paid” reflects accounting settlement only.";

export function projectBatch(batch: RemittanceBatchInput, voucher: RemittanceVoucherInput | null): RemittanceBatchHeader {
  return {
    id: batch.id,
    cycleMonth: batch.cycleMonth,
    cycleYear: batch.cycleYear,
    sequence: batch.sequence,
    currency: batch.currency,
    baseCurrency: batch.baseCurrency,
    status: batch.status,
    settledAt: batch.settledAt,
    claimCount: batch.claimCount,
    totalAmount: money(batch.totalAmount),
    baseTotalAmount: batch.status === SETTLED ? money(batch.baseTotalAmount) : null,
    voucher: voucher
      ? {
          voucherNumber: voucher.voucherNumber,
          totalAmount: money(voucher.totalAmount),
          baseTotalAmount: money(voucher.baseTotalAmount),
          status: voucher.status,
          processedAt: voucher.processedAt,
        }
      : null,
    disbursement: null,
    paymentFactsRecorded: false,
    paymentFactsNote: NO_DISBURSEMENT_NOTE,
  };
}

// ── conservation (§8 / I5 / I6, D-1, D-7) ────────────────────────────────────
export interface ConservationInput {
  currency: string;
  baseCurrency: string;
  status: string;
  batchTotal: unknown;
  batchBaseTotal: unknown;
  voucher: { totalAmount: unknown; baseTotalAmount: unknown } | null;
  sumClaimApproved: unknown;
  sumClaimPaid: unknown;
  sumClaimBase: unknown;
  sumLineApproved: unknown;
  /** D-7: false until F6.8 records ProviderDisbursement. */
  disbursementRecorded: boolean;
}

export interface ConservationResult {
  currency: string;
  baseCurrency: string;
  // transaction axis (I5)
  sumLinePayable: string;
  sumClaimPayable: string;
  batchTotal: string;
  voucherTotal: string | null;
  sumPaid: string;
  // base axis (I6)
  sumClaimBase: string;
  batchBaseTotal: string | null;
  voucherBaseTotal: string | null;
  legs: {
    lineToHeader: boolean; // Σ line payable = Σ claim payable (R-1 / D-1)
    headerToBatch: boolean; // Σ claim payable = stored batch total
    batchToVoucher: boolean | null; // = voucher amount (null when no voucher yet)
    paidToApproved: boolean | null; // Σ paid = Σ approved (only once SETTLED)
    baseHeaderToBatch: boolean | null; // I6 (only once SETTLED)
    baseBatchToVoucher: boolean | null;
  };
  i5Holds: boolean;
  i6Holds: boolean | null; // null until SETTLED (D-9)
  disbursementLeg: "MISSING" | "RECORDED"; // D-7
  notes: string[];
}

export function computeConservation(input: ConservationInput): ConservationResult {
  const isSettled = input.status === SETTLED;
  const hasVoucher = input.voucher != null;

  const lineToHeader = eq2(input.sumLineApproved, input.sumClaimApproved);
  const headerToBatch = eq2(input.sumClaimApproved, input.batchTotal);
  const batchToVoucher = hasVoucher ? eq2(input.batchTotal, input.voucher!.totalAmount) : null;
  const paidToApproved = isSettled ? eq2(input.sumClaimPaid, input.sumClaimApproved) : null;

  const baseHeaderToBatch = isSettled ? eq2(input.sumClaimBase, input.batchBaseTotal) : null;
  const baseBatchToVoucher = isSettled && hasVoucher ? eq2(input.batchBaseTotal, input.voucher!.baseTotalAmount) : null;

  // I5 holds when every APPLICABLE transaction-axis leg holds. The disbursement
  // leg is excluded because ProviderDisbursement does not exist yet (D-7).
  const i5Holds =
    lineToHeader &&
    headerToBatch &&
    (batchToVoucher ?? true) &&
    (paidToApproved ?? true);

  const i6Holds = isSettled ? (baseHeaderToBatch ?? false) && (baseBatchToVoucher ?? true) : null;

  const notes: string[] = [];
  if (!lineToHeader) notes.push("D-1: line payable Σ diverges from the claim header; header (approvedAmount) is authoritative for money (R-1).");
  if (!isSettled) notes.push("Batch not yet SETTLED — paid and base-currency legs are not applicable until mark-paid (D-9).");
  if (!hasVoucher) notes.push("No voucher yet — the voucher leg is not applicable until the batch is settled.");
  notes.push("D-7: the successful-disbursement leg of I5 is unverifiable until ProviderDisbursement exists (F6.7/F6.8).");

  return {
    currency: input.currency,
    baseCurrency: input.baseCurrency,
    sumLinePayable: money(input.sumLineApproved),
    sumClaimPayable: money(input.sumClaimApproved),
    batchTotal: money(input.batchTotal),
    voucherTotal: hasVoucher ? money(input.voucher!.totalAmount) : null,
    sumPaid: money(input.sumClaimPaid),
    sumClaimBase: money(input.sumClaimBase),
    batchBaseTotal: isSettled ? money(input.batchBaseTotal) : null,
    voucherBaseTotal: hasVoucher ? money(input.voucher!.baseTotalAmount) : null,
    legs: { lineToHeader, headerToBatch, batchToVoucher, paidToApproved, baseHeaderToBatch, baseBatchToVoucher },
    i5Holds,
    i6Holds,
    disbursementLeg: input.disbursementRecorded ? "RECORDED" : "MISSING",
    notes,
  };
}
