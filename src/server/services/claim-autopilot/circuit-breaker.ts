/**
 * Claims Autopilot — circuit breaker (F4.7, §13.3).
 *
 * Operations can stop LIVE automatic decisions per tenant or client immediately,
 * without deleting policy history. While open, intake/receipts/evaluation/shadow/
 * routing continue — only live money execution is blocked (the claim routes or is
 * shadowed). A critical invariant/failure can trip it automatically. Manual
 * open/close and auto-trips are hash-chain audited; the breaker never rolls back a
 * decision already committed.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auditChainService } from "@/server/services/audit-chain.service";
import { getSystemActorId } from "@/server/services/system-actor.service";

type Db = PrismaClient | Prisma.TransactionClient;

/** True when a tenant-wide OR the given client's breaker is open. */
export async function isBreakerOpen(db: Db, tenantId: string, clientId?: string | null): Promise<boolean> {
  const scopes: Prisma.ClaimAutopilotBreakerWhereInput[] = [{ clientId: null }];
  if (clientId) scopes.push({ clientId });
  const open = await db.claimAutopilotBreaker.findFirst({ where: { tenantId, isOpen: true, OR: scopes }, select: { id: true } });
  return !!open;
}

async function setBreaker(tenantId: string, clientId: string | null, data: Prisma.ClaimAutopilotBreakerUncheckedUpdateInput & { isOpen: boolean }): Promise<void> {
  const existing = await prisma.claimAutopilotBreaker.findFirst({ where: { tenantId, clientId } });
  if (existing) {
    await prisma.claimAutopilotBreaker.update({ where: { id: existing.id }, data });
  } else {
    await prisma.claimAutopilotBreaker.create({ data: { tenantId, clientId, ...data } as Prisma.ClaimAutopilotBreakerUncheckedCreateInput });
  }
}

async function audit(actorId: string, tenantId: string, action: string, clientId: string | null, reason: string, autoTriggered: boolean): Promise<void> {
  await auditChainService
    .append({ actorId, action, module: "CLAIMS", entityType: "Tenant", entityId: tenantId, payload: { clientId, reason, autoTriggered }, tenantId, description: `Autopilot circuit breaker ${action.endsWith("OPENED") ? "OPENED" : "CLOSED"}${clientId ? ` for client ${clientId}` : " (tenant-wide)"} — ${reason}` })
    .catch(() => undefined);
}

/** Open the breaker immediately (manual, RBAC-gated at the action layer). */
export async function openBreaker(tenantId: string, opts: { clientId?: string | null; actorId: string; reason: string; autoTriggered?: boolean }): Promise<void> {
  const clientId = opts.clientId ?? null;
  await setBreaker(tenantId, clientId, { isOpen: true, reason: opts.reason, autoTriggered: opts.autoTriggered ?? false, openedById: opts.actorId, openedAt: new Date(), closedById: null, closedAt: null });
  await audit(opts.actorId, tenantId, "AUTO_ADJ:CIRCUIT_BREAKER_OPENED", clientId, opts.reason, opts.autoTriggered ?? false);
}

/** Close the breaker (reason required for safety). */
export async function closeBreaker(tenantId: string, opts: { clientId?: string | null; actorId: string; reason: string }): Promise<void> {
  if (!opts.reason?.trim()) throw new Error("A reason is required to close the circuit breaker.");
  const clientId = opts.clientId ?? null;
  await setBreaker(tenantId, clientId, { isOpen: false, reason: opts.reason, closedById: opts.actorId, closedAt: new Date() });
  await audit(opts.actorId, tenantId, "AUTO_ADJ:CIRCUIT_BREAKER_CLOSED", clientId, opts.reason, false);
}

/** Automatic trip — the hook for invariant/critical-failure alerts (F7.2/F3.6). */
export async function tripBreaker(tenantId: string, reason: string, clientId?: string | null): Promise<void> {
  const actorId = await getSystemActorId(tenantId);
  await openBreaker(tenantId, { clientId: clientId ?? null, actorId, reason, autoTriggered: true });
}

export async function getBreakerState(tenantId: string, clientId?: string | null) {
  return prisma.claimAutopilotBreaker.findFirst({ where: { tenantId, clientId: clientId ?? null } });
}
