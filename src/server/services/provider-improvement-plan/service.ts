import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient, type ImprovementPlanStatus, type ImprovementActionStatus, type ImprovementOwnerRole } from "@prisma/client";
import { ProviderAccessService, type ProviderAccessContext } from "@/server/services/provider-access.service";
import { auditChainService } from "@/server/services/audit-chain.service";
import { NotificationOutboxService } from "@/server/services/notifications/outbox";

/**
 * PNOS F7.7 — provider network improvement plan (spec §12; D21 advisory).
 *
 * A human-owned plan AGREED between a named network manager (operator) and the
 * provider: objectives, actions/milestones, evidence, and a SHARED-vs-INTERNAL
 * update log. This service writes ONLY its own three models — it NEVER mutates a
 * rate, tier, contract, or provider status. There are NO automated sanctions and
 * NO scoring engine (§0 prohibited; F8 metrics are stubbed as a free-text ref).
 */

export const IMPROVEMENT_PLAN_READ_PERMISSION = "provider.performance.read";
const NETWORK_MANAGER_ROLES = ["SUPER_ADMIN"];

export type ImprovementPlanErrorCode = "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "STALE" | "INVALID_STATE";
export class ImprovementPlanError extends Error {
  constructor(public code: ImprovementPlanErrorCode, message: string) {
    super(message);
    this.name = "ImprovementPlanError";
  }
}
export function isImprovementPlanError(e: unknown): e is ImprovementPlanError {
  return e instanceof ImprovementPlanError;
}

/** Operator (network manager) actor — the human owner on the TPA side. */
export interface NetworkPlanActor { userId: string; tenantId: string; role: string }

// Advisory status transitions (human-driven; nothing cascades to a contract/provider).
const PLAN_TRANSITIONS: Record<ImprovementPlanStatus, ImprovementPlanStatus[]> = {
  DRAFT: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["ACHIEVED", "CLOSED", "CANCELLED"],
  ACHIEVED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

function assertNetwork(actor: NetworkPlanActor): void {
  if (!NETWORK_MANAGER_ROLES.includes(actor.role)) throw new ImprovementPlanError("FORBIDDEN", "A network manager role is required.");
}

async function appendUpdate(
  tx: Prisma.TransactionClient,
  m: { tenantId: string; planId: string; audience: "SHARED" | "INTERNAL"; body: string; actorType: string; actorId?: string | null },
): Promise<void> {
  const last = await tx.providerImprovementUpdate.findFirst({ where: { planId: m.planId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  await tx.providerImprovementUpdate.create({
    data: { tenantId: m.tenantId, planId: m.planId, sequence: (last?.sequence ?? 0) + 1, audience: m.audience, body: m.body, actorType: m.actorType, actorId: m.actorId ?? null },
  });
}

export const ProviderImprovementPlanService = {
  /** Network manager opens a plan with the provider (named owners, objective, baseline ref, target date). */
  async create(
    actor: NetworkPlanActor,
    cmd: { providerId: string; title: string; objective: string; baselineMetricRef?: string; providerOwnerId?: string; startDate?: Date; targetDate?: Date },
    db: PrismaClient = prisma,
  ): Promise<{ id: string; status: ImprovementPlanStatus; version: number }> {
    assertNetwork(actor);
    if (!cmd.title?.trim() || !cmd.objective?.trim()) throw new ImprovementPlanError("INVALID", "A title and an objective are required.");
    if (!cmd.targetDate) throw new ImprovementPlanError("INVALID", "A target date is required.");
    const provider = await db.provider.findFirst({ where: { id: cmd.providerId, tenantId: actor.tenantId }, select: { id: true } });
    if (!provider) throw new ImprovementPlanError("NOT_FOUND", "Provider not found.");

    const plan = await db.providerImprovementPlan.create({
      data: {
        tenantId: actor.tenantId, providerId: cmd.providerId, title: cmd.title.trim(), objective: cmd.objective.trim(),
        baselineMetricRef: cmd.baselineMetricRef?.trim() || null, networkOwnerId: actor.userId, providerOwnerId: cmd.providerOwnerId ?? null,
        status: "DRAFT", startDate: cmd.startDate ?? null, targetDate: cmd.targetDate, createdById: actor.userId,
      },
      select: { id: true, status: true, version: true },
    });
    await auditChainService.append({
      actorId: actor.userId, action: "IMPROVEMENT_PLAN:CREATE", module: "PROVIDER",
      entityType: "ProviderImprovementPlan", entityId: plan.id, tenantId: actor.tenantId,
      payload: { providerId: cmd.providerId }, description: `Improvement plan opened for provider ${cmd.providerId}.`,
    });
    await NotificationOutboxService.enqueue({
      tenantId: actor.tenantId, providerId: cmd.providerId, channel: "IN_APP", eventType: "IMPROVEMENT_PLAN_OPENED", priority: "NORMAL",
      title: "A network improvement plan was shared with you", body: cmd.title.trim(), href: "/provider/performance", metadata: { planId: plan.id }, dedupeKey: `improvement-plan-opened:${plan.id}`,
    }).catch(() => undefined);
    return plan;
  },

  /** Network manager adds an action/milestone (with an owner + due date). */
  async addAction(
    actor: NetworkPlanActor,
    planId: string,
    cmd: { description: string; ownerRole?: ImprovementOwnerRole; dueDate?: Date; evidenceDocumentIds?: string[] },
    db: PrismaClient = prisma,
  ): Promise<{ id: string }> {
    assertNetwork(actor);
    if (!cmd.description?.trim()) throw new ImprovementPlanError("INVALID", "An action description is required.");
    const plan = await db.providerImprovementPlan.findFirst({ where: { id: planId, tenantId: actor.tenantId }, select: { id: true } });
    if (!plan) throw new ImprovementPlanError("NOT_FOUND", "Plan not found.");
    const action = await db.providerImprovementAction.create({
      data: { tenantId: actor.tenantId, planId, description: cmd.description.trim(), ownerRole: cmd.ownerRole ?? "PROVIDER", dueDate: cmd.dueDate ?? null, evidenceDocumentIds: cmd.evidenceDocumentIds ?? [] },
      select: { id: true },
    });
    return action;
  },

  /** Network manager sets an action status. */
  async updateActionStatus(actor: NetworkPlanActor, planId: string, actionId: string, status: ImprovementActionStatus, db: PrismaClient = prisma): Promise<void> {
    assertNetwork(actor);
    const res = await db.providerImprovementAction.updateMany({ where: { id: actionId, planId, tenantId: actor.tenantId }, data: { status } });
    if (res.count === 0) throw new ImprovementPlanError("NOT_FOUND", "Action not found.");
  },

  /** Provider updates the status of an action they OWN (PROVIDER-owned actions only). */
  async providerUpdateActionStatus(ctx: ProviderAccessContext, planId: string, actionId: string, status: ImprovementActionStatus, db: PrismaClient = prisma): Promise<void> {
    ProviderAccessService.requirePermission(ctx, IMPROVEMENT_PLAN_READ_PERMISSION);
    const plan = await db.providerImprovementPlan.findFirst({ where: { id: planId, tenantId: ctx.tenantId, providerId: ctx.providerId }, select: { id: true } });
    if (!plan) throw new ImprovementPlanError("NOT_FOUND", "Plan not found.");
    const res = await db.providerImprovementAction.updateMany({ where: { id: actionId, planId, tenantId: ctx.tenantId, ownerRole: "PROVIDER" }, data: { status } });
    if (res.count === 0) throw new ImprovementPlanError("FORBIDDEN", "You can only update an action assigned to you.");
  },

  /** Network manager posts a SHARED or INTERNAL update. */
  async postNetworkUpdate(actor: NetworkPlanActor, planId: string, input: { audience: "SHARED" | "INTERNAL"; body: string }, db: PrismaClient = prisma): Promise<void> {
    assertNetwork(actor);
    if (!input.body?.trim()) throw new ImprovementPlanError("INVALID", "An update is required.");
    const plan = await db.providerImprovementPlan.findFirst({ where: { id: planId, tenantId: actor.tenantId }, select: { id: true, providerId: true } });
    if (!plan) throw new ImprovementPlanError("NOT_FOUND", "Plan not found.");
    await db.$transaction((tx) => appendUpdate(tx, { tenantId: actor.tenantId, planId, audience: input.audience, body: input.body.trim(), actorType: "TPA_USER", actorId: actor.userId }));
    if (input.audience === "SHARED") {
      await NotificationOutboxService.enqueue({
        tenantId: actor.tenantId, providerId: plan.providerId, channel: "IN_APP", eventType: "IMPROVEMENT_PLAN_UPDATE", priority: "NORMAL",
        title: "Improvement plan update", body: input.body.trim(), href: "/provider/performance", metadata: { planId }, dedupeKey: `improvement-plan-update:${planId}:${Date.now()}`,
      }).catch(() => undefined);
    }
  },

  /** Provider posts a SHARED update — a provider can NEVER post an internal note. */
  async postProviderUpdate(ctx: ProviderAccessContext, planId: string, body: string, db: PrismaClient = prisma): Promise<void> {
    ProviderAccessService.requirePermission(ctx, IMPROVEMENT_PLAN_READ_PERMISSION);
    if (!body?.trim()) throw new ImprovementPlanError("INVALID", "An update is required.");
    const plan = await db.providerImprovementPlan.findFirst({ where: { id: planId, tenantId: ctx.tenantId, providerId: ctx.providerId }, select: { id: true } });
    if (!plan) throw new ImprovementPlanError("NOT_FOUND", "Plan not found.");
    await db.$transaction((tx) => appendUpdate(tx, { tenantId: ctx.tenantId, planId, audience: "SHARED", body: body.trim(), actorType: "PROVIDER_USER", actorId: ctx.actorId }));
  },

  /** Network manager advances the plan status (advisory — no contract/provider side effect). */
  async setStatus(actor: NetworkPlanActor, planId: string, expectedVersion: number, status: ImprovementPlanStatus, db: PrismaClient = prisma): Promise<{ status: ImprovementPlanStatus; version: number }> {
    assertNetwork(actor);
    const plan = await db.providerImprovementPlan.findFirst({ where: { id: planId, tenantId: actor.tenantId }, select: { status: true } });
    if (!plan) throw new ImprovementPlanError("NOT_FOUND", "Plan not found.");
    if (!(PLAN_TRANSITIONS[plan.status] ?? []).includes(status)) throw new ImprovementPlanError("INVALID_STATE", `Cannot move a ${plan.status.toLowerCase()} plan to ${status.toLowerCase()}.`);
    const res = await db.providerImprovementPlan.updateMany({ where: { id: planId, tenantId: actor.tenantId, version: expectedVersion, status: plan.status }, data: { status, version: { increment: 1 } } });
    if (res.count === 0) throw new ImprovementPlanError("STALE", "This plan changed since you loaded it — refresh and retry.");
    await auditChainService.append({
      actorId: actor.userId, action: "IMPROVEMENT_PLAN:STATUS", module: "PROVIDER",
      entityType: "ProviderImprovementPlan", entityId: planId, tenantId: actor.tenantId, payload: { status }, description: `Improvement plan ${planId} → ${status.toLowerCase()}.`,
    });
    return { status, version: expectedVersion + 1 };
  },

  // ── reads ────────────────────────────────────────────────────────────────
  /** Provider view — own plans only, SHARED updates only (never an internal note). */
  async getForProvider(ctx: ProviderAccessContext, planId: string, db: PrismaClient = prisma) {
    ProviderAccessService.requirePermission(ctx, IMPROVEMENT_PLAN_READ_PERMISSION);
    const plan = await db.providerImprovementPlan.findFirst({
      where: { id: planId, tenantId: ctx.tenantId, providerId: ctx.providerId },
      include: { actions: { orderBy: { createdAt: "asc" } }, updates: { where: { audience: "SHARED" }, orderBy: { sequence: "asc" } } },
    });
    if (!plan) return null;
    return plan;
  },
  async listForProvider(ctx: ProviderAccessContext, db: PrismaClient = prisma) {
    ProviderAccessService.requirePermission(ctx, IMPROVEMENT_PLAN_READ_PERMISSION);
    return db.providerImprovementPlan.findMany({ where: { tenantId: ctx.tenantId, providerId: ctx.providerId }, orderBy: { createdAt: "desc" }, take: 100 });
  },
  // Network manager view — full row incl. INTERNAL updates. The caller gates the role.
  async getForNetwork(actor: NetworkPlanActor, planId: string, db: PrismaClient = prisma) {
    assertNetwork(actor);
    return db.providerImprovementPlan.findFirst({ where: { id: planId, tenantId: actor.tenantId }, include: { actions: { orderBy: { createdAt: "asc" } }, updates: { orderBy: { sequence: "asc" } } } });
  },
  async listForNetwork(actor: NetworkPlanActor, opts: { providerId?: string; status?: ImprovementPlanStatus } = {}, db: PrismaClient = prisma) {
    assertNetwork(actor);
    return db.providerImprovementPlan.findMany({ where: { tenantId: actor.tenantId, ...(opts.providerId ? { providerId: opts.providerId } : {}), ...(opts.status ? { status: opts.status } : {}) }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 300 });
  },
} as const;
