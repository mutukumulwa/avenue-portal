import type { PaymentQueryStatus } from "@prisma/client";

/**
 * PNOS F6.10 — payment-query lifecycle policy + provider-safe projection (pure).
 *
 * A payment query is a collaboration object about settlement/payment facts (D17)
 * — it NEVER changes a claim decision. The provider sees only SHARED state; the
 * assigned reviewer/team and internal resolution note stay internal (§9).
 */

export const PAYMENT_QUERY_TRANSITIONS: Record<PaymentQueryStatus, PaymentQueryStatus[]> = {
  OPEN: ["ACKNOWLEDGED", "INFORMATION_REQUIRED", "WITHDRAWN", "REJECTED"],
  ACKNOWLEDGED: ["INFORMATION_REQUIRED", "RESOLVED", "REJECTED", "WITHDRAWN"],
  INFORMATION_REQUIRED: ["PROVIDER_RESPONDED", "RESOLVED", "WITHDRAWN", "REJECTED"],
  PROVIDER_RESPONDED: ["ACKNOWLEDGED", "INFORMATION_REQUIRED", "RESOLVED", "REJECTED", "WITHDRAWN"],
  RESOLVED: ["CLOSED"],
  REJECTED: ["CLOSED"],
  WITHDRAWN: [],
  CLOSED: [],
};

export const PAYMENT_QUERY_TERMINAL: PaymentQueryStatus[] = ["WITHDRAWN", "CLOSED"];
/** A provider may withdraw its own query before it is resolved/rejected/closed. */
export const PROVIDER_WITHDRAWABLE: PaymentQueryStatus[] = ["OPEN", "ACKNOWLEDGED", "INFORMATION_REQUIRED", "PROVIDER_RESPONDED"];

export function canTransitionPaymentQuery(from: PaymentQueryStatus, to: PaymentQueryStatus): boolean {
  return PAYMENT_QUERY_TRANSITIONS[from].includes(to);
}
export function isPaymentQueryTerminal(status: PaymentQueryStatus): boolean {
  return PAYMENT_QUERY_TERMINAL.includes(status);
}

export interface PaymentQueryRow {
  id: string;
  settlementBatchId: string;
  claimId: string | null;
  claimLineId: string | null;
  disbursementId: string | null;
  category: string;
  discrepancyAmount: unknown;
  discrepancyCurrency: string | null;
  providerNarrative: string;
  status: PaymentQueryStatus;
  dueAt: Date | null;
  resolutionCode: string | null;
  resolutionExplanation: string | null;
  linkedReconsiderationId: string | null;
  createdAt: Date;
  // internal fields deliberately NOT in the safe projection:
  assignedReviewerId?: string | null;
  assignedTeam?: string | null;
  resolutionInternalNote?: string | null;
}

export interface PaymentQuerySafe {
  id: string;
  settlementBatchId: string;
  claimId: string | null;
  disbursementId: string | null;
  category: string;
  discrepancyAmount: string | null;
  discrepancyCurrency: string | null;
  narrative: string;
  status: PaymentQueryStatus;
  dueAt: Date | null;
  resolutionCode: string | null;
  resolutionExplanation: string | null;
  linkedReconsiderationId: string | null;
  createdAt: Date;
}

/** Provider-safe projection — allow-list only; internal owner/note never carried. */
export function toProviderPaymentQueryProjection(row: PaymentQueryRow): PaymentQuerySafe {
  return {
    id: row.id,
    settlementBatchId: row.settlementBatchId,
    claimId: row.claimId,
    disbursementId: row.disbursementId,
    category: row.category,
    discrepancyAmount: row.discrepancyAmount == null ? null : String(row.discrepancyAmount),
    discrepancyCurrency: row.discrepancyCurrency,
    narrative: row.providerNarrative,
    status: row.status,
    dueAt: row.dueAt,
    resolutionCode: row.resolutionCode,
    resolutionExplanation: row.resolutionExplanation, // SAFE explanation only (internal note dropped)
    linkedReconsiderationId: row.linkedReconsiderationId,
    createdAt: row.createdAt,
  };
}

export interface PaymentQueryMessageRow {
  audience: string;
  eventType: string;
  body: string | null;
  createdAt: Date;
}
/** Provider timeline — SHARED messages only, with no internal actor/metadata. */
export function toProviderPaymentQueryTimeline(messages: PaymentQueryMessageRow[]): { at: Date; eventType: string; body: string | null }[] {
  return messages
    .filter((m) => m.audience === "SHARED")
    .map((m) => ({ at: m.createdAt, eventType: m.eventType, body: m.body }));
}
