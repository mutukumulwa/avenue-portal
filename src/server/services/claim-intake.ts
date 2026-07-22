import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ClaimIntakeService, type SubmitResult } from "@/server/services/claim-intake/intake.service";
import { IntakeError } from "@/server/services/claim-intake/errors";
import type { CallerIdentity } from "@/server/services/claim-intake/context";
import type { ServiceType, BenefitCategory, ClaimLineCategory } from "@prisma/client";

export interface IntakeLineItem {
  serviceCategory: ClaimLineCategory;
  cptCode: string;
  description: string;
  icdCode: string;
  quantity: number;
  unitCost: number;
  billedAmount: number;
}

export interface IntakeDiagnosis {
  code: string;
  description: string;
  standardCharge: number | null;
  isPrimary: boolean;
}

export interface ClaimIntakeInput {
  memberId: string;
  providerId: string;
  providerBranchId?: string;
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
 * The direct-entry caller. The admin wizard is an operator user selecting a
 * provider; the provider portal is a provider user whose facility is derived from
 * the session (F5.1, §7.2/D12). Both map onto a canonical `CallerIdentity`.
 */
export type DirectEntryCaller =
  | { kind: "operatorUser"; tenantId: string; userId: string }
  | { kind: "providerUser"; tenantId: string; userId: string; providerId: string };

export type DirectEntryOutcome =
  | {
      ok: true;
      claimId: string;
      claimNumber: string | null;
      receiptId: string;
      correlationId: string;
      billedAmount: number;
      outcome: SubmitResult["outcome"];
      replayed: boolean;
    }
  | { ok: false; code: string; error: string };

/** Compose a caller-safe message: prefer specific field issues, else the top message. */
function friendlyMessage(e: IntakeError): string {
  if (e.issues && e.issues.length > 0) return e.issues.map((i) => i.message).join("; ");
  return e.message;
}

/** Map the legacy direct-entry input onto the canonical `ClaimSubmissionV1` envelope. */
function toSubmission(data: ClaimIntakeInput, idempotencyKey: string) {
  return {
    schemaVersion: "1" as const,
    idempotencyKey,
    member: { memberId: data.memberId },
    provider: {
      providerId: data.providerId,
      ...(data.providerBranchId ? { branchId: data.providerBranchId } : {}),
    },
    encounter: {
      serviceType: data.serviceType,
      benefitCategory: data.benefitCategory,
      serviceFrom: data.dateOfService,
      ...(data.admissionDate ? { admissionDate: data.admissionDate } : {}),
      ...(data.dischargeDate ? { dischargeDate: data.dischargeDate } : {}),
      ...(data.attendingDoctor?.trim() ? { attendingDoctor: data.attendingDoctor.trim() } : {}),
    },
    diagnoses: data.diagnoses.map((d) => ({
      code: d.code,
      ...(d.description?.trim() ? { description: d.description.trim() } : {}),
      isPrimary: d.isPrimary,
    })),
    lines: data.lineItems.map((l) => ({
      serviceCategory: l.serviceCategory,
      // Empty codes are omitted (the schema's codeField rejects "").
      ...(l.cptCode?.trim() ? { cptCode: l.cptCode.trim() } : {}),
      ...(l.icdCode?.trim() ? { icdCode: l.icdCode.trim() } : {}),
      description: l.description,
      quantity: l.quantity,
      unitCost: l.unitCost,
      billedAmount: l.billedAmount,
    })),
  };
}

function callerIdentity(caller: DirectEntryCaller): CallerIdentity {
  return caller.kind === "providerUser"
    ? { kind: "providerUser", tenantId: caller.tenantId, userId: caller.userId, providerId: caller.providerId }
    : { kind: "operatorUser", tenantId: caller.tenantId, userId: caller.userId };
}

/**
 * Process an accepted claim's run in-request, best-effort (D9). Interactive and
 * synchronous API rails want a decision as soon as possible — but the durable
 * processing run and the recovery sweep (F3.6) remain the authoritative
 * backstop, so a failure here never affects acceptance. Lease semantics
 * (`claimRunById`) make this safe even if a worker races the same run.
 * Exported for the B2B API adapter (F5.2).
 */
export async function processAcceptedRunInline(claimId: string): Promise<void> {
  try {
    const [{ processClaimRun }, { claimRunById }, { registerClaimAutopilotProcessor }] = await Promise.all([
      import("@/server/jobs/claim-autopilot.job"),
      import("@/server/services/claim-intake/processing"),
      import("@/server/services/claim-autopilot/processor"),
    ]);
    // The worker registers the real evaluate→plan→execute processor on its own
    // boot; server actions run in the web runtime, so register it here too
    // (idempotent) — otherwise the fail-closed default would route every claim to
    // manual instead of auto-adjudicating.
    registerClaimAutopilotProcessor();
    const run = await prisma.claimProcessingRun.findFirst({
      where: { claimId, state: { in: ["PENDING", "RETRYABLE"] } },
      orderBy: { sequence: "desc" },
      select: { id: true },
    });
    if (!run) return;
    const owner = `web:${process.pid}:${randomUUID().slice(0, 8)}`;
    const claimed = await claimRunById(prisma, run.id, { leaseOwner: owner });
    if (claimed) await processClaimRun(prisma, claimed, owner);
  } catch {
    /* best-effort; the durable run + recovery sweep are authoritative (D8/D9) */
  }
}

/**
 * The admin claim wizard AND the provider facility portal converge here (F5.1).
 * This is now a thin adapter over the canonical intake service — it OWNS no
 * business rules: structural gates live in the schema/context, and eligibility /
 * benefit / pre-auth are routed by the staged evaluator (D6, accepted-and-routed).
 *
 * `idempotencyKey` is the form's draft UUID (stable across retries) so a
 * double-click or back/refresh REPLAYS the same receipt instead of creating a
 * duplicate claim (§8.3). Acceptance is synchronous; the accepted claim is then
 * processed inline when possible, with the recovery sweep as the backstop.
 */
export async function runClaimIntake(
  caller: DirectEntryCaller,
  data: ClaimIntakeInput,
  opts: { idempotencyKey: string },
): Promise<DirectEntryOutcome> {
  const billedAmount = data.lineItems.reduce((s, l) => s + l.billedAmount, 0);
  try {
    const result = await ClaimIntakeService.submit(callerIdentity(caller), toSubmission(data, opts.idempotencyKey));

    // A freshly ACCEPTED claim is decided in-request when possible; a REPLAY/LINK
    // already has (or is getting) its decision — never double-process.
    if (result.outcome === "ACCEPTED" && result.claimId) {
      await processAcceptedRunInline(result.claimId);
    }

    return {
      ok: true,
      claimId: result.claimId ?? "",
      claimNumber: result.claimNumber,
      receiptId: result.receiptId,
      correlationId: result.correlationId,
      billedAmount,
      outcome: result.outcome,
      replayed: result.replayed,
    };
  } catch (err) {
    const e = IntakeError.from(err);
    return { ok: false, code: e.code, error: friendlyMessage(e) };
  }
}
