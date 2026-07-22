/**
 * Claims Autopilot — the real claim processor (F4.5).
 *
 * Replaces the F3.6 fail-closed default: evaluate the claim (staged, read-only) →
 * build the AutoDecisionPlan → route / propose (shadow) / execute (live). LIVE
 * execution runs through `ClaimDecisionService.executeAutoPlan` — the SAME
 * atomic money transaction as a human decision (D10/D11). A stale plan re-routes
 * or, if the claim is already decided (crash after commit), reconciles the run to
 * AUTO_DECIDED without moving money again (CA-061).
 */
import type { PrismaClient } from "@prisma/client";
import { setClaimProcessor, type ClaimProcessor, type ProcessorOutcome } from "@/server/jobs/claim-autopilot.job";
import { buildAutoDecisionPlan } from "./plan";
import { getReason, type RouteCode } from "@/server/services/claim-intake/reason-catalog";

const claimAutopilotProcessor: ClaimProcessor = async (db: PrismaClient, run): Promise<ProcessorOutcome> => {
  const plan = await buildAutoDecisionPlan(db, run.tenantId, run.claimId, run.id);

  if (plan.disposition === "ROUTE") {
    return { kind: "ROUTED", routeCode: plan.routeCode ?? "AUTO_POLICY_NOT_LIVE", assignedQueue: plan.assignedQueue ?? null, modeResolved: plan.mode, policyId: plan.policyId };
  }

  // SHADOW: record the proposal, move NO money (D2), and route the claim to
  // normal human processing so a human decides it (F4.6).
  if (plan.mode === "SHADOW") {
    const { storeShadowProposal } = await import("./shadow");
    await storeShadowProposal(db, run.id, plan);
    return { kind: "SHADOW_COMPLETE", routeCode: plan.routeCode ?? null, assignedQueue: "MANUAL_ADJUDICATION", modeResolved: "SHADOW", policyId: plan.policyId };
  }

  // LIVE APPROVE / PARTIAL → execute atomically through the one decision stack.
  const { ClaimDecisionService } = await import("@/server/services/claim-decision.service");
  const { getSystemActorId } = await import("@/server/services/system-actor.service");
  const systemActorId = await getSystemActorId(run.tenantId);
  const result = await ClaimDecisionService.executeAutoPlan(run.tenantId, run.claimId, plan, systemActorId);

  if (result.executed) return { kind: "AUTO_DECIDED", modeResolved: "LIVE", policyId: plan.policyId };

  // F4.7 (D18): breaker open ⇒ move NO money — downgrade to a shadow proposal and
  // route to a human (evaluation continues while the breaker is open).
  if (result.breakerOpen) {
    const { storeShadowProposal } = await import("./shadow");
    await storeShadowProposal(db, run.id, plan);
    return { kind: "SHADOW_COMPLETE", routeCode: null, assignedQueue: "MANUAL_ADJUDICATION", modeResolved: "SHADOW", policyId: plan.policyId };
  }

  // Not executed. If the claim is already decided (a crash after the money
  // committed but before the run terminated), reconcile to AUTO_DECIDED — never
  // move money twice. Otherwise the plan is stale ⇒ re-evaluate on the next run.
  if (result.stale) {
    const claim = await db.claim.findUnique({ where: { id: run.claimId }, select: { status: true } });
    if (claim && ["APPROVED", "PARTIALLY_APPROVED"].includes(claim.status)) {
      return { kind: "AUTO_DECIDED", modeResolved: "LIVE", policyId: plan.policyId };
    }
    return { kind: "RETRY", safeMessage: `stale plan re-evaluated: ${result.reason ?? "revision changed"}` };
  }
  // A non-executable plan (should not happen for APPROVE/PARTIAL) routes safely.
  const code = (plan.routeCode ?? "AUTO_POLICY_NOT_LIVE") as RouteCode;
  return { kind: "ROUTED", routeCode: code, assignedQueue: getReason(code).queue, modeResolved: plan.mode, policyId: plan.policyId };
};

/** Register the real processor (call at worker boot and app init). */
export function registerClaimAutopilotProcessor(): void {
  setClaimProcessor(claimAutopilotProcessor);
}

export { claimAutopilotProcessor };
