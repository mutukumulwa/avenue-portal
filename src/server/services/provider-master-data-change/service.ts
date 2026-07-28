import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient, type MasterDataChangeCategory, type MasterDataChangeStatus, type MasterDataChangeRisk } from "@prisma/client";
import { ProviderAccessService, type ProviderAccessContext } from "@/server/services/provider-access.service";
import { auditChainService } from "@/server/services/audit-chain.service";
import { NotificationOutboxService } from "@/server/services/notifications/outbox";
import {
  MASTER_DATA_CATEGORY_POLICY,
  buildCurrentSnapshot,
  canTransitionMasterData,
  isMasterDataTerminal,
  projectProposedValues,
  requiresMakerChecker,
  PROVIDER_WITHDRAWABLE_MASTER_DATA,
} from "./policy";

/**
 * PNOS F7.4 — provider master-data change-request service (spec §7.10).
 *
 * A provider PROPOSES an allow-listed profile/branch/practitioner/credential/bank/
 * integration change; this service writes ONLY the change request + its events and
 * NEVER mutates active master data directly. An approved change calls the canonical
 * owning service through an injectable applier (default = the Provider/Branch
 * updater for the safe categories). Sensitive changes (bank, risk HIGH) require
 * maker ≠ checker and are NOT activated here — F7.5 adds the independent
 * verification + activation. The full sensitive value never reaches this row
 * (policy masks it). Stop (F7.4): no pages, no bank activation.
 */

export const MASTER_DATA_CHANGE_PERMISSION = "provider.profile.change_request";
// Operator-only review (§ "provider master-data activation without permission" is prohibited).
const MASTER_DATA_REVIEWER_ROLES = ["SUPER_ADMIN"];
const DAY_MS = 24 * 60 * 60 * 1000;

export type MasterDataChangeErrorCode = "NOT_FOUND" | "FORBIDDEN" | "STALE" | "INVALID_STATE" | "INVALID" | "NOT_ACTIVATABLE";
export class MasterDataChangeError extends Error {
  constructor(public code: MasterDataChangeErrorCode, message: string) {
    super(message);
    this.name = "MasterDataChangeError";
  }
}
export function isMasterDataChangeError(e: unknown): e is MasterDataChangeError {
  return e instanceof MasterDataChangeError;
}

export interface MasterDataReviewer { userId: string; tenantId: string; role: string }

export interface SubmitMasterDataChangeCommand {
  category: MasterDataChangeCategory;
  proposed: Record<string, unknown>;
  providerBranchId?: string;
  evidenceDocumentIds?: string[];
  narrative?: string;
  idempotencyKey?: string;
}

export interface MasterDataChangeResult {
  id: string;
  status: MasterDataChangeStatus;
  version: number;
  riskLevel: MasterDataChangeRisk;
  replayed?: boolean;
}

/**
 * The canonical apply port: an approved, activatable change is applied to its
 * owning record HERE (inside the approval tx, exactly once). Injectable so tests
 * can spy and F7.6/owning services can supply richer appliers.
 */
export type MasterDataApplyPort = (
  tx: Prisma.TransactionClient,
  input: { category: MasterDataChangeCategory; providerId: string; providerBranchId: string | null; proposed: Record<string, unknown> },
) => Promise<void>;

export const defaultMasterDataApplier: MasterDataApplyPort = async (tx, input) => {
  const policy = MASTER_DATA_CATEGORY_POLICY[input.category];
  if (!policy.autoApply) throw new MasterDataChangeError("NOT_ACTIVATABLE", `A ${input.category.toLowerCase()} change is not auto-activated in this release.`);
  // Defence in depth: re-pick ONLY the allowed, non-sensitive fields.
  const data: Record<string, unknown> = {};
  for (const f of policy.allowedFields) {
    if (policy.sensitiveFields.includes(f)) continue;
    if (Object.prototype.hasOwnProperty.call(input.proposed, f)) data[f] = input.proposed[f];
  }
  if (Object.keys(data).length === 0) return;
  if (policy.scope === "BRANCH") {
    if (!input.providerBranchId) throw new MasterDataChangeError("INVALID", "A branch change needs a branch.");
    await tx.providerBranch.update({ where: { id: input.providerBranchId }, data: data as Prisma.ProviderBranchUpdateInput });
  } else {
    await tx.provider.update({ where: { id: input.providerId }, data: data as Prisma.ProviderUpdateInput });
  }
};

const PROVIDER_SNAPSHOT_SELECT = {
  phone: true, email: true, address: true, county: true, contactPerson: true, operatingHours: true, isOpen24Hours: true,
  licenceNumber: true, licenceExpiry: true, registrationNumber: true, taxPin: true, facilityLevel: true, bankDetailsRef: true,
} satisfies Prisma.ProviderSelect;

async function appendEvent(
  tx: Prisma.TransactionClient,
  m: { tenantId: string; changeRequestId: string; audience: "SHARED" | "INTERNAL"; eventType: string; priorStatus?: string | null; newStatus?: string | null; body?: string | null; actorType: string; actorId?: string | null },
): Promise<void> {
  const last = await tx.providerMasterDataChangeEvent.findFirst({ where: { changeRequestId: m.changeRequestId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  await tx.providerMasterDataChangeEvent.create({
    data: {
      tenantId: m.tenantId, changeRequestId: m.changeRequestId, sequence: (last?.sequence ?? 0) + 1,
      audience: m.audience, eventType: m.eventType, priorStatus: m.priorStatus ?? null, newStatus: m.newStatus ?? null,
      body: m.body ?? null, actorType: m.actorType, actorId: m.actorId ?? null,
    },
  });
}

export const ProviderMasterDataChangeService = {
  /**
   * Provider proposes a change. Validates the category allow-list (a disallowed
   * field is rejected — never silently dropped), required evidence, and provider/
   * branch scope; snapshots the MASKED current values + stores the MASKED proposed
   * values (sensitive fields never persist in full). Idempotent on idempotencyKey.
   */
  async submit(ctx: ProviderAccessContext, cmd: SubmitMasterDataChangeCommand, db: PrismaClient = prisma): Promise<MasterDataChangeResult> {
    ProviderAccessService.requirePermission(ctx, MASTER_DATA_CHANGE_PERMISSION);
    const policy = MASTER_DATA_CATEGORY_POLICY[cmd.category];
    if (!policy) throw new MasterDataChangeError("INVALID", "Unknown change category.");

    const proj = projectProposedValues(cmd.category, cmd.proposed);
    if (proj.disallowed.length > 0) {
      throw new MasterDataChangeError("INVALID", `These fields are not allowed for a ${cmd.category.toLowerCase()} change: ${proj.disallowed.join(", ")}.`);
    }
    if (cmd.category !== "OTHER" && Object.keys(proj.stored).length === 0) {
      throw new MasterDataChangeError("INVALID", "At least one proposed change is required.");
    }
    if (policy.requiresEvidence && (!cmd.evidenceDocumentIds || cmd.evidenceDocumentIds.length === 0)) {
      throw new MasterDataChangeError("INVALID", "This change requires supporting evidence.");
    }

    const provider = await db.provider.findFirst({ where: { id: ctx.providerId, tenantId: ctx.tenantId }, select: PROVIDER_SNAPSHOT_SELECT });
    if (!provider) throw new MasterDataChangeError("NOT_FOUND", "Provider not found.");

    let branch: Record<string, unknown> | null = null;
    if (policy.scope === "BRANCH") {
      if (!cmd.providerBranchId) throw new MasterDataChangeError("INVALID", "A branch change needs a branch.");
      branch = await db.providerBranch.findFirst({ where: { id: cmd.providerBranchId, tenantId: ctx.tenantId, providerId: ctx.providerId }, select: { name: true, address: true, county: true, code: true } });
      if (!branch) throw new MasterDataChangeError("NOT_FOUND", "Branch not found.");
    }

    const currentSnapshot = buildCurrentSnapshot(cmd.category, (branch ?? (provider as Record<string, unknown>)));

    if (cmd.idempotencyKey) {
      const existing = await db.providerMasterDataChangeRequest.findFirst({ where: { tenantId: ctx.tenantId, idempotencyKey: cmd.idempotencyKey }, select: { id: true, status: true, version: true, riskLevel: true } });
      if (existing) return { ...existing, replayed: true };
    }

    const dueAt = new Date(Date.now() + policy.slaDays * DAY_MS);

    let created: { id: string; status: MasterDataChangeStatus; version: number; riskLevel: MasterDataChangeRisk };
    try {
      created = await db.$transaction(async (tx) => {
        const row = await tx.providerMasterDataChangeRequest.create({
          data: {
            tenantId: ctx.tenantId, providerId: ctx.providerId, providerBranchId: cmd.providerBranchId ?? null,
            category: cmd.category, riskLevel: policy.risk,
            currentSnapshot: currentSnapshot as Prisma.InputJsonValue,
            proposedValues: proj.stored as Prisma.InputJsonValue,
            evidenceDocumentIds: cmd.evidenceDocumentIds ?? [],
            providerNarrative: cmd.narrative?.trim() || null,
            status: "SUBMITTED", providerRequesterId: ctx.actorId,
            slaPolicy: `MDC-${cmd.category}-${policy.slaDays}d`, dueAt,
            idempotencyKey: cmd.idempotencyKey ?? null,
          },
          select: { id: true, status: true, version: true, riskLevel: true },
        });
        await appendEvent(tx, { tenantId: ctx.tenantId, changeRequestId: row.id, audience: "SHARED", eventType: "SUBMITTED", newStatus: "SUBMITTED", body: cmd.narrative?.trim() ?? null, actorType: "PROVIDER_USER", actorId: ctx.actorId });
        return row;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && cmd.idempotencyKey) {
        const winner = await db.providerMasterDataChangeRequest.findFirst({ where: { tenantId: ctx.tenantId, idempotencyKey: cmd.idempotencyKey }, select: { id: true, status: true, version: true, riskLevel: true } });
        if (winner) return { ...winner, replayed: true };
      }
      throw e;
    }

    await auditChainService.append({
      actorId: ctx.actorId, action: "MASTER_DATA_CHANGE:SUBMIT", module: "PROVIDER",
      entityType: "ProviderMasterDataChangeRequest", entityId: created.id, tenantId: ctx.tenantId,
      payload: { category: cmd.category, risk: policy.risk }, description: `Provider submitted a ${cmd.category.toLowerCase()} master-data change request.`,
    });
    return created;
  },

  /** Provider answers a reviewer's information request. */
  async respondToInformation(ctx: ProviderAccessContext, id: string, expectedVersion: number, body: string, db: PrismaClient = prisma): Promise<MasterDataChangeResult> {
    ProviderAccessService.requirePermission(ctx, MASTER_DATA_CHANGE_PERMISSION);
    if (!body?.trim()) throw new MasterDataChangeError("INVALID", "A response is required.");
    await assertProviderOwns(db, ctx, id);
    return runTransition(db, { actorId: ctx.actorId, actorType: "PROVIDER_USER", tenantId: ctx.tenantId, providerId: ctx.providerId }, id, ["INFORMATION_REQUIRED"], "PROVIDER_RESPONDED", expectedVersion, {}, { eventType: "PROVIDER_RESPONDED", audience: "SHARED", body: body.trim(), auditAction: "MASTER_DATA_CHANGE:RESPOND" });
  },

  /** Provider withdraws its own request before a decision. */
  async withdraw(ctx: ProviderAccessContext, id: string, expectedVersion: number, db: PrismaClient = prisma): Promise<MasterDataChangeResult> {
    ProviderAccessService.requirePermission(ctx, MASTER_DATA_CHANGE_PERMISSION);
    await assertProviderOwns(db, ctx, id);
    return runTransition(db, { actorId: ctx.actorId, actorType: "PROVIDER_USER", tenantId: ctx.tenantId, providerId: ctx.providerId }, id, PROVIDER_WITHDRAWABLE_MASTER_DATA, "WITHDRAWN", expectedVersion, {}, { eventType: "WITHDRAWN", audience: "SHARED", auditAction: "MASTER_DATA_CHANGE:WITHDRAW" });
  },

  // ── reviewer (operator) side ────────────────────────────────────────────────
  /** Reviewer picks up the request (→ UNDER_REVIEW, assigns itself). */
  async startReview(reviewer: MasterDataReviewer, id: string, expectedVersion: number, db: PrismaClient = prisma): Promise<MasterDataChangeResult> {
    assertReviewer(reviewer);
    return runTransition(db, { actorId: reviewer.userId, actorType: "TPA_USER", tenantId: reviewer.tenantId }, id, ["SUBMITTED", "PROVIDER_RESPONDED"], "UNDER_REVIEW", expectedVersion, { assignedReviewerId: reviewer.userId }, { eventType: "UNDER_REVIEW", audience: "SHARED", auditAction: "MASTER_DATA_CHANGE:REVIEW", notify: { title: "Change request under review", body: "We are reviewing your master-data change request." } });
  },

  async requestInformation(reviewer: MasterDataReviewer, id: string, expectedVersion: number, prompt: string, db: PrismaClient = prisma): Promise<MasterDataChangeResult> {
    assertReviewer(reviewer);
    if (!prompt?.trim()) throw new MasterDataChangeError("INVALID", "A prompt is required.");
    return runTransition(db, { actorId: reviewer.userId, actorType: "TPA_USER", tenantId: reviewer.tenantId }, id, ["SUBMITTED", "UNDER_REVIEW", "PROVIDER_RESPONDED"], "INFORMATION_REQUIRED", expectedVersion, {}, { eventType: "INFO_REQUESTED", audience: "SHARED", body: prompt.trim(), auditAction: "MASTER_DATA_CHANGE:REQUEST_INFO", notify: { title: "More information needed", body: prompt.trim() } });
  },

  async reject(reviewer: MasterDataReviewer, id: string, expectedVersion: number, input: { code?: string; explanation: string }, db: PrismaClient = prisma): Promise<MasterDataChangeResult> {
    assertReviewer(reviewer);
    if (!input.explanation?.trim()) throw new MasterDataChangeError("INVALID", "A rejection explanation is required.");
    return runTransition(db, { actorId: reviewer.userId, actorType: "TPA_USER", tenantId: reviewer.tenantId }, id, ["SUBMITTED", "UNDER_REVIEW", "INFORMATION_REQUIRED", "PROVIDER_RESPONDED", "PENDING_CHECKER"], "REJECTED", expectedVersion, { decisionCode: input.code ?? "REJECTED", decisionExplanation: input.explanation.trim() }, { eventType: "REJECTED", audience: "SHARED", body: input.explanation.trim(), auditAction: "MASTER_DATA_CHANGE:REJECT", notify: { title: "Change request declined", body: input.explanation.trim() } });
  },

  /**
   * Reviewer approves. LOW/MEDIUM: single approval → APPROVED, and an AUTO-APPLY
   * category is activated through the applier IN THE SAME TX (exactly once).
   * HIGH (sensitive/bank): a two-person control — the first approval records the
   * MAKER and moves to PENDING_CHECKER; a DISTINCT checker's approval moves to
   * APPROVED but does NOT activate (F7.5 verifies + activates). Version+status CAS
   * ⇒ a change is approved (and applied) at most once.
   */
  async approve(
    reviewer: MasterDataReviewer,
    id: string,
    expectedVersion: number,
    input: { code?: string; explanation?: string; internalNote?: string } = {},
    deps: { apply?: MasterDataApplyPort } = {},
    db: PrismaClient = prisma,
  ): Promise<MasterDataChangeResult> {
    assertReviewer(reviewer);
    const apply = deps.apply ?? defaultMasterDataApplier;
    const row = await db.providerMasterDataChangeRequest.findFirst({
      where: { id, tenantId: reviewer.tenantId },
      select: { id: true, status: true, version: true, riskLevel: true, category: true, providerId: true, providerBranchId: true, makerId: true, proposedValues: true },
    });
    if (!row) throw new MasterDataChangeError("NOT_FOUND", "Change request not found.");
    if (isMasterDataTerminal(row.status)) throw new MasterDataChangeError("INVALID_STATE", `A ${row.status.toLowerCase()} request cannot be approved.`);
    const now = new Date();
    const sensitive = requiresMakerChecker(row.riskLevel);

    // Sensitive MAKER step → PENDING_CHECKER (no activation).
    if (sensitive && row.status !== "PENDING_CHECKER") {
      return runTransition(db, { actorId: reviewer.userId, actorType: "TPA_USER", tenantId: reviewer.tenantId }, id, ["UNDER_REVIEW", "PROVIDER_RESPONDED"], "PENDING_CHECKER", expectedVersion, { makerId: reviewer.userId, makerAt: now, assignedReviewerId: reviewer.userId }, { eventType: "MAKER_APPROVED", audience: "INTERNAL", auditAction: "MASTER_DATA_CHANGE:MAKER_APPROVE", notify: { title: "Change request progressing", body: "Your change request passed the first approval." } });
    }

    // Sensitive CHECKER step → APPROVED (maker ≠ checker), NOT activated (F7.5).
    if (sensitive && row.status === "PENDING_CHECKER") {
      if (row.makerId && row.makerId === reviewer.userId) throw new MasterDataChangeError("FORBIDDEN", "The checker must be a different reviewer from the maker.");
      return runTransition(db, { actorId: reviewer.userId, actorType: "TPA_USER", tenantId: reviewer.tenantId }, id, ["PENDING_CHECKER"], "APPROVED", expectedVersion, { checkerId: reviewer.userId, checkerAt: now, decisionCode: input.code ?? "APPROVED", decisionExplanation: input.explanation?.trim() ?? null, decisionInternalNote: input.internalNote ?? null, effectiveAt: now }, { eventType: "APPROVED", audience: "SHARED", body: input.explanation?.trim() ?? null, auditAction: "MASTER_DATA_CHANGE:APPROVE", notify: { title: "Change request approved", body: "Approved; activation follows verification." } });
    }

    // Non-sensitive single approval → APPROVED (+ apply an auto-apply category in-tx).
    const policy = MASTER_DATA_CATEGORY_POLICY[row.category];
    for (const f of ["UNDER_REVIEW", "PROVIDER_RESPONDED"] as MasterDataChangeStatus[]) {
      if (!canTransitionMasterData(f, "APPROVED")) throw new MasterDataChangeError("INVALID_STATE", "Approval is not a legal transition here.");
    }
    const result = await db.$transaction(async (tx) => {
      const cas = await tx.providerMasterDataChangeRequest.updateMany({
        where: { id, tenantId: reviewer.tenantId, version: expectedVersion, status: { in: ["UNDER_REVIEW", "PROVIDER_RESPONDED"] } },
        data: {
          status: "APPROVED", version: { increment: 1 }, checkerId: reviewer.userId, checkerAt: now,
          decisionCode: input.code ?? "APPROVED", decisionExplanation: input.explanation?.trim() ?? null, decisionInternalNote: input.internalNote ?? null,
          effectiveAt: now, ...(policy.autoApply ? { activatedAt: now, activatedById: reviewer.userId } : {}),
        },
      });
      if (cas.count === 0) {
        const cur = await tx.providerMasterDataChangeRequest.findFirst({ where: { id, tenantId: reviewer.tenantId }, select: { status: true, version: true } });
        if (!cur) throw new MasterDataChangeError("NOT_FOUND", "Change request not found.");
        if (cur.version !== expectedVersion) throw new MasterDataChangeError("STALE", "This request changed since you loaded it — refresh and retry.");
        throw new MasterDataChangeError("INVALID_STATE", `A ${cur.status.toLowerCase()} request cannot be approved (start review first).`);
      }
      // Activate through the canonical owner, in-tx, exactly once.
      if (policy.autoApply) {
        await apply(tx, { category: row.category, providerId: row.providerId, providerBranchId: row.providerBranchId, proposed: (row.proposedValues ?? {}) as Record<string, unknown> });
      }
      await appendEvent(tx, { tenantId: reviewer.tenantId, changeRequestId: id, audience: "SHARED", eventType: "APPROVED", newStatus: "APPROVED", body: input.explanation?.trim() ?? null, actorType: "TPA_USER", actorId: reviewer.userId });
      return { version: expectedVersion + 1, providerId: row.providerId };
    });

    await auditChainService.append({
      actorId: reviewer.userId, action: "MASTER_DATA_CHANGE:APPROVE", module: "PROVIDER",
      entityType: "ProviderMasterDataChangeRequest", entityId: id, tenantId: reviewer.tenantId,
      payload: { category: row.category, activated: policy.autoApply }, description: `Master-data change ${id} approved${policy.autoApply ? " + activated" : ""}.`,
    });
    await NotificationOutboxService.enqueue({
      tenantId: reviewer.tenantId, providerId: result.providerId, channel: "IN_APP", eventType: "MASTER_DATA_CHANGE_APPROVED", priority: "NORMAL",
      title: "Change request approved", body: policy.autoApply ? "Your change has been applied." : "Approved; activation to follow.",
      href: "/provider/profile", metadata: { changeRequestId: id }, dedupeKey: `mdc-approved:${id}`,
    }).catch(() => undefined);
    return { id, status: "APPROVED", version: result.version, riskLevel: row.riskLevel };
  },

  // ── reads ────────────────────────────────────────────────────────────────
  async getForProvider(ctx: ProviderAccessContext, id: string, db: PrismaClient = prisma) {
    ProviderAccessService.requirePermission(ctx, MASTER_DATA_CHANGE_PERMISSION);
    const row = await db.providerMasterDataChangeRequest.findFirst({ where: { id, tenantId: ctx.tenantId, providerId: ctx.providerId }, include: { events: { where: { audience: "SHARED" }, orderBy: { sequence: "asc" } } } });
    if (!row) return null;
    return { request: toProviderProjection(row), version: row.version };
  },
  async listForProvider(ctx: ProviderAccessContext, db: PrismaClient = prisma) {
    ProviderAccessService.requirePermission(ctx, MASTER_DATA_CHANGE_PERMISSION);
    const rows = await db.providerMasterDataChangeRequest.findMany({ where: { tenantId: ctx.tenantId, providerId: ctx.providerId }, orderBy: { createdAt: "desc" }, take: 200 });
    return rows.map(toProviderProjection);
  },
  // Reviewer reads carry the full row incl. INTERNAL events — the caller gates the role.
  async listForReviewer(reviewer: MasterDataReviewer, opts: { status?: MasterDataChangeStatus } = {}, db: PrismaClient = prisma) {
    assertReviewer(reviewer);
    return db.providerMasterDataChangeRequest.findMany({ where: { tenantId: reviewer.tenantId, ...(opts.status ? { status: opts.status } : {}) }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 300 });
  },
  async getForReviewer(reviewer: MasterDataReviewer, id: string, db: PrismaClient = prisma) {
    assertReviewer(reviewer);
    return db.providerMasterDataChangeRequest.findFirst({ where: { id, tenantId: reviewer.tenantId }, include: { events: { orderBy: { sequence: "asc" } } } });
  },
} as const;

// ── internals ────────────────────────────────────────────────────────────────

function assertReviewer(reviewer: MasterDataReviewer): void {
  if (!MASTER_DATA_REVIEWER_ROLES.includes(reviewer.role)) throw new MasterDataChangeError("FORBIDDEN", "Master-data review requires an operator role.");
}

async function assertProviderOwns(db: PrismaClient, ctx: ProviderAccessContext, id: string): Promise<void> {
  const row = await db.providerMasterDataChangeRequest.findFirst({ where: { id, tenantId: ctx.tenantId, providerId: ctx.providerId }, select: { id: true } });
  if (!row) throw new MasterDataChangeError("NOT_FOUND", "Change request not found.");
}

/** A provider-safe projection — never the INTERNAL decision note (SHARED events only are included by the read). */
function toProviderProjection(row: {
  id: string; category: MasterDataChangeCategory; riskLevel: MasterDataChangeRisk; status: MasterDataChangeStatus;
  currentSnapshot: Prisma.JsonValue; proposedValues: Prisma.JsonValue; providerNarrative: string | null;
  decisionExplanation: string | null; dueAt: Date | null; createdAt: Date; providerBranchId: string | null;
  events?: Array<{ sequence: number; audience: string; eventType: string; body: string | null; newStatus: string | null; createdAt: Date }>;
}) {
  return {
    id: row.id, category: row.category, riskLevel: row.riskLevel, status: row.status,
    currentSnapshot: row.currentSnapshot, proposedValues: row.proposedValues, narrative: row.providerNarrative,
    decisionExplanation: row.decisionExplanation, dueAt: row.dueAt, createdAt: row.createdAt, providerBranchId: row.providerBranchId,
    timeline: (row.events ?? []).map((e) => ({ eventType: e.eventType, body: e.body, status: e.newStatus, at: e.createdAt })),
    // NOTE: decisionInternalNote + INTERNAL events + maker/checker/verification ids are NEVER projected here.
  };
}

interface TransitionActor { actorId: string; actorType: string; tenantId: string; providerId?: string }

async function runTransition(
  db: PrismaClient,
  actor: TransitionActor,
  id: string,
  from: MasterDataChangeStatus[],
  to: MasterDataChangeStatus,
  expectedVersion: number,
  data: Prisma.ProviderMasterDataChangeRequestUpdateManyMutationInput,
  opts: { eventType: string; audience: "SHARED" | "INTERNAL"; body?: string | null; auditAction: string; notify?: { title: string; body: string } },
): Promise<MasterDataChangeResult> {
  for (const f of from) if (!canTransitionMasterData(f, to)) throw new MasterDataChangeError("INVALID_STATE", `Cannot move a ${f.toLowerCase()} request to ${to.toLowerCase()}.`);

  const result = await db.$transaction(async (tx) => {
    const cas = await tx.providerMasterDataChangeRequest.updateMany({
      where: { id, tenantId: actor.tenantId, ...(actor.providerId ? { providerId: actor.providerId } : {}), version: expectedVersion, status: { in: from } },
      data: { ...data, status: to, version: { increment: 1 } },
    });
    if (cas.count === 0) {
      const cur = await tx.providerMasterDataChangeRequest.findFirst({ where: { id, tenantId: actor.tenantId }, select: { status: true, version: true } });
      if (!cur) throw new MasterDataChangeError("NOT_FOUND", "Change request not found.");
      if (cur.version !== expectedVersion) throw new MasterDataChangeError("STALE", "This request changed since you loaded it — refresh and retry.");
      throw new MasterDataChangeError("INVALID_STATE", `A ${cur.status.toLowerCase()} request cannot take this action.`);
    }
    const fresh = await tx.providerMasterDataChangeRequest.findFirst({ where: { id }, select: { version: true, providerId: true, riskLevel: true } });
    await appendEvent(tx, { tenantId: actor.tenantId, changeRequestId: id, audience: opts.audience, eventType: opts.eventType, newStatus: to, body: opts.body ?? null, actorType: actor.actorType, actorId: actor.actorId });
    return { version: fresh?.version ?? expectedVersion + 1, providerId: fresh?.providerId, riskLevel: fresh?.riskLevel };
  });

  await auditChainService.append({
    actorId: actor.actorId, action: opts.auditAction, module: "PROVIDER",
    entityType: "ProviderMasterDataChangeRequest", entityId: id, tenantId: actor.tenantId, payload: { to }, description: `Master-data change ${id} → ${to.toLowerCase()}.`,
  });
  if (opts.notify && result.providerId) {
    await NotificationOutboxService.enqueue({
      tenantId: actor.tenantId, providerId: result.providerId, channel: "IN_APP", eventType: `MASTER_DATA_CHANGE_${to}`, priority: "NORMAL",
      title: opts.notify.title, body: opts.notify.body, href: "/provider/profile", metadata: { changeRequestId: id }, dedupeKey: `mdc-${to}:${id}`,
    }).catch(() => undefined);
  }
  return { id, status: to, version: result.version, riskLevel: (result.riskLevel ?? "LOW") as MasterDataChangeRisk };
}
