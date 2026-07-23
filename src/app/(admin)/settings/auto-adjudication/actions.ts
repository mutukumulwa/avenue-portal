"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { submitPolicyChange, deactivatePolicy } from "@/server/services/claim-autopilot/policy-approval";
import { openBreaker, closeBreaker } from "@/server/services/claim-autopilot/circuit-breaker";
import { auditChainService } from "@/server/services/audit-chain.service";

async function auditPolicy(actorId: string, tenantId: string, action: string, policyId: string, payload: Record<string, unknown>, description: string) {
  await auditChainService
    .append({ actorId, action, module: "CLAIMS", entityType: "AutoAdjudicationPolicy", entityId: policyId, payload, tenantId, description })
    .catch(() => undefined);
}

const PATH = "/settings/auto-adjudication";

function fail(msg: string): never {
  redirect(`${PATH}?error=${encodeURIComponent(msg)}`);
}

/**
 * F6.5b — create a governed policy DRAFT (F2.4/F2.5). Drafts NEVER execute:
 * the effective mode stays OFF until a different checker approves the version
 * through the approval matrix (maker–checker), which supersedes the prior one.
 */
export async function createPolicyDraftAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const tenantId = session.user.tenantId;

  const name = ((formData.get("name") as string) || "").trim();
  const clientId = ((formData.get("clientId") as string) || "").trim() || null;
  const mode = ((formData.get("mode") as string) || "OFF").trim();
  const ceilingRaw = ((formData.get("maxAutoApproveAmount") as string) || "").trim();
  const maxAutoApproveAmount = ceilingRaw ? Number(ceilingRaw) : null;
  const currency = ((formData.get("currency") as string) || "UGX").trim().toUpperCase();
  const allowAutoPartial = formData.get("allowAutoPartial") === "on";
  const requireCleanFraud = formData.get("requireCleanFraud") !== "off";

  if (!name) fail("Give the policy version a name.");
  if (!["OFF", "SHADOW", "LIVE"].includes(mode)) fail("Mode must be OFF, SHADOW or LIVE.");
  if (maxAutoApproveAmount != null && (!Number.isFinite(maxAutoApproveAmount) || maxAutoApproveAmount < 0)) {
    fail("Auto-approve ceiling must be a non-negative number (or empty for none).");
  }
  if (mode === "LIVE" && maxAutoApproveAmount == null) {
    fail("A LIVE policy requires an auto-approve ceiling — automation may not move unbounded money.");
  }
  if (clientId) {
    const client = await prisma.client.findFirst({ where: { id: clientId, operatorTenantId: tenantId }, select: { id: true } });
    if (!client) fail("Client not found.");
  }

  const priorVersion = await prisma.autoAdjudicationPolicy.aggregate({
    where: { tenantId, clientId },
    _max: { version: true },
  });

  const created = await prisma.autoAdjudicationPolicy.create({
    data: {
      tenantId,
      clientId,
      name,
      version: (priorVersion._max.version ?? 0) + 1,
      mode: mode as never,
      status: "DRAFT",
      maxAutoApproveAmount,
      currency,
      allowAutoPartial,
      requireCleanFraud,
      enabled: false, // legacy flag: governed resolution reads mode/status, not this
      createdById: session.user.id,
      effectiveFrom: new Date(),
      isActive: false,
    },
    select: { id: true, version: true },
  });
  await auditPolicy(session.user.id, tenantId, "AUTO_ADJ:POLICY_DRAFTED", created.id,
    { name, clientId, mode, maxAutoApproveAmount, currency, version: created.version },
    `Policy draft v${created.version} "${name}" created (${mode}) — inert until checker approval`);

  revalidatePath(PATH);
  redirect(PATH);
}

/** F6.5b — maker submits a DRAFT/REJECTED version into the approval matrix. */
export async function submitPolicyForApprovalAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const policyId = (formData.get("id") as string) || "";
  try {
    const { requestId } = await submitPolicyChange(session.user.tenantId, policyId, session.user.id);
    await auditPolicy(session.user.id, session.user.tenantId, "AUTO_ADJ:POLICY_SUBMITTED", policyId,
      { requestId }, `Policy ${policyId} submitted for checker approval (request ${requestId})`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    fail(err instanceof Error ? err.message : "Could not submit the policy for approval.");
  }
  revalidatePath(PATH);
  redirect(PATH);
}

/** F6.5b — immediate deactivation (fail-safe; reason required, audited in-service). */
export async function deactivatePolicyAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const policyId = (formData.get("id") as string) || "";
  const reason = ((formData.get("reason") as string) || "").trim();
  if (!reason) fail("A reason is required to deactivate a policy.");
  try {
    await deactivatePolicy(session.user.tenantId, policyId, session.user.id, reason);
    await auditPolicy(session.user.id, session.user.tenantId, "AUTO_ADJ:POLICY_DEACTIVATED", policyId,
      { reason }, `Policy ${policyId} deactivated — ${reason}`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    fail(err instanceof Error ? err.message : "Could not deactivate the policy.");
  }
  revalidatePath(PATH);
  redirect(PATH);
}

/** F6.5a — open the circuit breaker (D18): stops LIVE money immediately. Audited in-service. */
export async function openBreakerAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const reason = ((formData.get("reason") as string) || "").trim();
  const clientId = ((formData.get("clientId") as string) || "").trim() || null;
  if (!reason) fail("A reason is required to open the circuit breaker.");
  await openBreaker(session.user.tenantId, { clientId, actorId: session.user.id, reason });
  revalidatePath(PATH);
  redirect(PATH);
}

/** F6.5a — close the circuit breaker (reason required; audited in-service). */
export async function closeBreakerAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const reason = ((formData.get("reason") as string) || "").trim();
  const clientId = ((formData.get("clientId") as string) || "").trim() || null;
  if (!reason) fail("A reason is required to close the circuit breaker.");
  try {
    await closeBreaker(session.user.tenantId, { clientId, actorId: session.user.id, reason });
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    fail(err instanceof Error ? err.message : "Could not close the breaker.");
  }
  revalidatePath(PATH);
  redirect(PATH);
}
