import type { RemittanceBatchHeader, RemittanceClaim, ConservationResult } from "@/server/services/provider-remittance/projection";

/**
 * PNOS F6.6 — remittance PDF/print data (pure).
 *
 * Flattens the SAME provider-safe read model (getBatchRemittance) into the DTO the
 * @react-pdf statement renders — no separate query or arithmetic (D15). Provider-safe
 * by construction: it only reads the provider-safe projection, so no admin/GL/internal/
 * bank field can reach the PDF. Money stays as 2dp strings from the read model; the
 * Document formats with the batch currency. The generated time is passed in (not read
 * from the wall clock) so the builder is deterministic and unit-testable.
 */

export const REMITTANCE_PDF_VERSION = "1.0";

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(v: Date | string | null): string {
  return v ? new Date(v).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export interface RemittancePdfLine {
  description: string;
  cpt: string | null;
  billed: string;
  allowed: string | null;
  disallowed: string;
  memberShare: string;
  writeoff: string;
  approved: string;
  paid: string;
  reason: string | null;
}

export interface RemittancePdfClaim {
  claimNumber: string;
  member: string;
  memberNumber: string | null;
  serviceDate: string;
  submissionType: string;
  isSupplemental: boolean;
  approved: string;
  paid: string;
  declineReason: string | null;
  lines: RemittancePdfLine[];
}

export interface RemittancePdfData {
  version: string;
  cycle: string;
  currency: string;
  status: string;
  settledAt: string | null;
  voucherRef: string | null;
  generatedAt: string | null;
  /** Reconciliation anchor printed on the statement (stored batch total). */
  controlTotal: string;
  conservationOk: boolean;
  paymentFactsNote: string;
  claims: RemittancePdfClaim[];
  claimsShown: number;
  totalClaims: number;
}

export function buildRemittancePdfData(
  input: {
    batch: RemittanceBatchHeader;
    claims: RemittanceClaim[];
    conservation: ConservationResult;
    page: { totalClaims: number };
  },
  opts: { generatedAt?: Date } = {},
): RemittancePdfData {
  const { batch, claims, conservation, page } = input;
  return {
    version: REMITTANCE_PDF_VERSION,
    cycle: `${MONTHS[batch.cycleMonth] ?? batch.cycleMonth} ${batch.cycleYear}${batch.sequence > 1 ? ` · Run ${batch.sequence}` : ""}`,
    currency: batch.currency,
    status: batch.status.replace(/_/g, " "),
    settledAt: batch.settledAt ? fmtDate(batch.settledAt) : null,
    voucherRef: batch.voucher?.voucherNumber ?? null,
    generatedAt: opts.generatedAt ? fmtDate(opts.generatedAt) : null,
    controlTotal: batch.totalAmount,
    conservationOk: conservation.i5Holds,
    paymentFactsNote: batch.paymentFactsNote,
    claims: claims.map((c) => ({
      claimNumber: c.claimNumber,
      member: c.member?.name ?? "",
      memberNumber: c.member?.memberNumber ?? null,
      serviceDate: fmtDate(c.dateOfService),
      submissionType: c.lineage.submissionType,
      isSupplemental: c.lineage.isSupplemental,
      approved: c.approved,
      paid: c.paid,
      declineReason: c.declineReason?.text ?? null,
      lines: c.lines.map((l) => ({
        description: l.description,
        cpt: l.cptCode,
        billed: l.billed,
        allowed: l.contractedAllowed,
        disallowed: l.disallowed,
        memberShare: l.memberShare,
        writeoff: l.providerWriteoff,
        approved: l.approvedPayable,
        paid: l.paid,
        reason: l.reason?.text ?? null,
      })),
    })),
    claimsShown: claims.length,
    totalClaims: page.totalClaims,
  };
}
