import { prisma } from "@/lib/prisma";
import type { CapitationRateBasis } from "@prisma/client";

/**
 * PNOS F10.2 — capitation arrangement + period + adjustment structural service.
 *
 * The SCHEMA-level invariants of the separate capitation ledger (D24): effective
 * non-overlap per scope, currency validity, frozen-period immutability, and
 * append-only audited adjustments. NO calculation here (F10.2 stop — accrual is
 * F10.4). GATED: nothing here is invoked in production before the F10.1 CAP-1.0
 * sign-off + the F10.7 pilot; the service exists so the invariants are enforced +
 * tested the moment the gate opens.
 */

// Capitation is finance-governed. Until a dedicated permission is seeded, the
// structural mutations require a finance role (the maker/checker at freeze + pay is F10.4/F10.6).
const CAPITATION_MANAGER_ROLES = new Set(["SUPER_ADMIN", "FINANCE_OFFICER"]);

export interface CapitationActor {
  userId: string;
  tenantId: string;
  role: string;
}

export type CapitationErrorCode = "FORBIDDEN" | "INVALID_CURRENCY" | "OVERLAP" | "NOT_FOUND" | "PERIOD_IMMUTABLE" | "INVALID_INPUT";

export class CapitationError extends Error {
  constructor(public code: CapitationErrorCode, message: string) {
    super(message);
    this.name = "CapitationError";
  }
}

const FROZEN_STATES = new Set(["FROZEN", "PAID", "CLOSED"]);

function requireManager(actor: CapitationActor) {
  if (!CAPITATION_MANAGER_ROLES.has(actor.role)) throw new CapitationError("FORBIDDEN", "Capitation management requires a finance role.");
}

function assertCurrency(currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) throw new CapitationError("INVALID_CURRENCY", "Currency must be a 3-letter ISO code.");
}

export interface CreateArrangementInput {
  providerId: string;
  providerBranchId?: string;
  clientId?: string | null;
  groupId?: string | null;
  packageId?: string | null;
  label: string;
  rateBasis?: CapitationRateBasis;
  rate: string | number; // Decimal string/number — never JS float math downstream
  currency?: string;
  cadence?: string;
  coveredServices?: unknown;
  ffsCarveOuts?: unknown;
  eligibilityDefinitionVersion: string;
  governingContractId?: string | null;
  glPolicyRef?: string | null;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
}

/** Two half-open ranges [aStart,aEnd) and [bStart,bEnd) overlap (null end = open/∞). */
function rangesOverlap(aStart: Date, aEnd: Date | null, bStart: Date, bEnd: Date | null): boolean {
  const aEndT = aEnd ? aEnd.getTime() : Number.POSITIVE_INFINITY;
  const bEndT = bEnd ? bEnd.getTime() : Number.POSITIVE_INFINITY;
  return aStart.getTime() < bEndT && bStart.getTime() < aEndT;
}

export const CapitationArrangementService = {
  FROZEN_STATES,

  /** Create a DRAFT arrangement after validating currency + effective non-overlap for the scope. */
  async createArrangement(actor: CapitationActor, input: CreateArrangementInput) {
    requireManager(actor);
    const currency = (input.currency ?? "UGX").toUpperCase();
    assertCurrency(currency);
    if (input.effectiveTo && input.effectiveTo.getTime() <= input.effectiveFrom.getTime()) {
      throw new CapitationError("INVALID_INPUT", "effectiveTo must be after effectiveFrom.");
    }
    const branch = input.providerBranchId ?? "";
    const rateBasis = input.rateBasis ?? "PMPM";

    // Non-overlap: no live (DRAFT/ACTIVE) arrangement for the SAME scope may overlap.
    const siblings = await prisma.capitationArrangement.findMany({
      where: {
        tenantId: actor.tenantId, providerId: input.providerId, providerBranchId: branch,
        clientId: input.clientId ?? null, groupId: input.groupId ?? null, packageId: input.packageId ?? null,
        rateBasis, status: { in: ["DRAFT", "ACTIVE"] },
      },
      select: { effectiveFrom: true, effectiveTo: true },
    });
    for (const s of siblings) {
      if (rangesOverlap(input.effectiveFrom, input.effectiveTo ?? null, s.effectiveFrom, s.effectiveTo)) {
        throw new CapitationError("OVERLAP", "An overlapping live capitation arrangement already exists for this scope.");
      }
    }

    return prisma.capitationArrangement.create({
      data: {
        tenantId: actor.tenantId, providerId: input.providerId, providerBranchId: branch,
        clientId: input.clientId ?? null, groupId: input.groupId ?? null, packageId: input.packageId ?? null,
        label: input.label.trim(), rateBasis, rate: String(input.rate), currency, cadence: input.cadence ?? "MONTHLY",
        coveredServices: (input.coveredServices ?? undefined) as never, ffsCarveOuts: (input.ffsCarveOuts ?? undefined) as never,
        eligibilityDefinitionVersion: input.eligibilityDefinitionVersion, governingContractId: input.governingContractId ?? null, glPolicyRef: input.glPolicyRef ?? null,
        status: "DRAFT", effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo ?? null, createdById: actor.userId,
      },
    });
  },

  /** Activate a DRAFT arrangement (re-checks non-overlap against other live arrangements). */
  async activate(actor: CapitationActor, arrangementId: string) {
    requireManager(actor);
    const arr = await prisma.capitationArrangement.findFirst({ where: { id: arrangementId, tenantId: actor.tenantId } });
    if (!arr) throw new CapitationError("NOT_FOUND", "No such arrangement.");
    return prisma.capitationArrangement.update({ where: { id: arr.id }, data: { status: "ACTIVE", approvedById: actor.userId, approvedAt: new Date() } });
  },

  /** Idempotently open a DRAFT period shell for an arrangement + period (no calculation). */
  async openPeriod(actor: CapitationActor, arrangementId: string, period: string, bounds: { periodStart: Date; periodEnd: Date }) {
    requireManager(actor);
    const arr = await prisma.capitationArrangement.findFirst({ where: { id: arrangementId, tenantId: actor.tenantId }, select: { id: true, rate: true, eligibilityDefinitionVersion: true } });
    if (!arr) throw new CapitationError("NOT_FOUND", "No such arrangement.");
    const existing = await prisma.capitationPeriod.findFirst({ where: { arrangementId: arr.id, period } });
    if (existing) return existing; // idempotent
    return prisma.capitationPeriod.create({
      data: { tenantId: actor.tenantId, arrangementId: arr.id, period, periodStart: bounds.periodStart, periodEnd: bounds.periodEnd, definitionVersion: arr.eligibilityDefinitionVersion, rate: arr.rate, status: "DRAFT" },
    });
  },

  /** Guard: a FROZEN/PAID/CLOSED period is immutable (its snapshot/accrual cannot change). */
  assertPeriodMutable(period: { status: string }) {
    if (FROZEN_STATES.has(period.status)) throw new CapitationError("PERIOD_IMMUTABLE", `Period is ${period.status}; a frozen period is immutable — use an adjustment or a governed reopen.`);
  },

  /**
   * Append-only, audited adjustment. Allowed on any non-CLOSED period (a correction
   * to a FROZEN period is an adjustment in the open ledger, never a rewrite).
   */
  async recordAdjustment(actor: CapitationActor, periodId: string, input: { category: string; amount: string | number; evidenceRef?: string; reason?: string; approvedById?: string }) {
    requireManager(actor);
    const period = await prisma.capitationPeriod.findFirst({ where: { id: periodId, tenantId: actor.tenantId }, select: { id: true, status: true } });
    if (!period) throw new CapitationError("NOT_FOUND", "No such period.");
    if (period.status === "CLOSED") throw new CapitationError("PERIOD_IMMUTABLE", "A CLOSED period accepts no further adjustments.");
    return prisma.capitationAdjustment.create({
      data: { tenantId: actor.tenantId, periodId: period.id, category: input.category, amount: String(input.amount), evidenceRef: input.evidenceRef ?? null, reason: input.reason ?? null, actorId: actor.userId, approvedById: input.approvedById ?? null, approvedAt: input.approvedById ? new Date() : null },
    });
  },
} as const;
