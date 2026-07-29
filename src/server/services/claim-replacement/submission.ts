import { Prisma, type ServiceType, type BenefitCategory } from "@prisma/client";
import type { IntakeLineItem, IntakeDiagnosis } from "@/server/services/claim-intake";

/**
 * PNOS F5.7/F5.10 — the shared "replacement full-form contract" + intake plumbing that both
 * a correction (F5.7, supersedes a pre-decision claim) and a post-decline resubmission
 * (F5.10, links a new claim while the original stays DECLINED) reuse. Kept separate so the
 * two services share ONE envelope builder and retry policy without either depending on the
 * other's transaction orchestration.
 */

export interface ReplaceClaimCommand {
  tenantId: string;
  /** The claim being replaced (must be this provider's and in an eligible state). */
  predecessorClaimId: string;
  /** Stable across retries (the form draft id) — resolves replay/conflict. 8–128 chars. */
  idempotencyKey: string;
  /** Free-text reason (bounded/no-HTML by the schema; recorded in provenance/audit). */
  reason?: string;
  // ── the FULL replacement claim content (NOT a patch) ────────────────────────
  serviceType: ServiceType;
  benefitCategory: BenefitCategory;
  dateOfService: string;
  admissionDate?: string;
  dischargeDate?: string;
  attendingDoctor?: string;
  diagnoses: IntakeDiagnosis[];
  lineItems: IntakeLineItem[];
}

/**
 * Map the replacement content onto the canonical submission envelope. member/provider come
 * from the predecessor (a replacement fixes/refiles CONTENT, never re-identifies the claim);
 * NO invoice number ⇒ null strong fingerprint ⇒ a new linked claim, never a strong-link/
 * conflict against the predecessor (autopilot plan §"explicit replacement reference").
 */
export function buildReplacementSubmission(
  predecessor: { memberId: string; providerId: string; providerBranchId: string | null; claimNumber: string },
  command: ReplaceClaimCommand,
) {
  return {
    schemaVersion: "1" as const,
    idempotencyKey: command.idempotencyKey,
    member: { memberId: predecessor.memberId },
    provider: {
      providerId: predecessor.providerId,
      ...(predecessor.providerBranchId ? { branchId: predecessor.providerBranchId } : {}),
    },
    encounter: {
      serviceType: command.serviceType,
      benefitCategory: command.benefitCategory,
      serviceFrom: command.dateOfService,
      ...(command.admissionDate ? { admissionDate: command.admissionDate } : {}),
      ...(command.dischargeDate ? { dischargeDate: command.dischargeDate } : {}),
      ...(command.attendingDoctor?.trim() ? { attendingDoctor: command.attendingDoctor.trim() } : {}),
    },
    diagnoses: command.diagnoses.map((d) => ({
      code: d.code,
      ...(d.description?.trim() ? { description: d.description.trim() } : {}),
      isPrimary: d.isPrimary,
    })),
    lines: command.lineItems.map((l) => ({
      serviceCategory: l.serviceCategory,
      ...(l.cptCode?.trim() ? { cptCode: l.cptCode.trim() } : {}),
      ...(l.icdCode?.trim() ? { icdCode: l.icdCode.trim() } : {}),
      description: l.description,
      quantity: l.quantity,
      unitCost: l.unitCost,
      billedAmount: l.billedAmount,
    })),
    // Explicit replacement reference — the lineage identity (NOT a reused authoritative id).
    replacementOfClaimRef: predecessor.claimNumber,
    ...(command.reason?.trim() ? { correctionReason: command.reason.trim() } : {}),
  };
}

export const MAX_TX_ATTEMPTS = 6;

/** A claim-number (P2002) or serialization (P2034) collision — retry the whole tx. */
export function isRetryableWrite(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2002" || err.code === "P2034");
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
