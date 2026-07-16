import { Prisma } from "@prisma/client";
import type { BenefitCategory } from "@prisma/client";

/**
 * benefit-usage.service.ts — single home for benefit-limit arithmetic
 * (PR-016 / PR-011, remediation plan W1).
 *
 * Every writer (claim decisions, PA holds, reversals) and every reader
 * (available-limit checks, member surfaces) goes through these helpers so the
 * ledger stays consistent:
 *
 *   available = annualSubLimit − amountUsed − activeHoldAmount
 *
 * Rules encoded here:
 *  - The usage row is keyed (member, benefitConfig, period) and is **upserted**
 *    when absent (PR-016 D2) — the pre-remediation `updateMany` silently
 *    no-opped for members without a row and, worse, incremented every
 *    category's row when rows existed.
 *  - All writes are scoped to the benefit config resolved from the member's
 *    package version + benefit category — never "whatever period row matches".
 *  - The benefit period is anchored to the member's enrollment anniversary
 *    (same derivation the legacy reserve logic used).
 */

export interface ResolvedBenefitConfig {
  configId: string;
  benefitCategory: string;
  annualSubLimit: number;
  periodStart: Date;
  periodEnd: Date;
}

// ─── P1 (TPA_PRIORITY_SIX): one availability result ─────────────────────────
// Decisions recorded in uat/priority-six/P1_BENEFIT_DECISIONS.md (DEC-02..06).

export type BenefitConstraintKind =
  | "PER_VISIT"
  | "CATEGORY"
  | "OVERALL"
  | "SHARED_MEMBER"
  | "SHARED_FAMILY";

export interface BenefitConstraint {
  kind: BenefitConstraintKind;
  label: string;
  limit: number;
  used: number;
  held: number;
  available: number;
}

export interface BenefitAvailability {
  memberId: string;
  familyRootId: string;
  benefitConfigId: string;
  benefitCategory: string;
  periodStart: Date;
  periodEnd: Date;
  requestedAmount: number;
  /** Minimum available across every applicable constraint. */
  payableCeiling: number;
  constraints: BenefitConstraint[];
  /** The constraint with the smallest available amount (ties: first). */
  binding: BenefitConstraint | null;
  /** Reason code for the binding constraint (P1.5), e.g. BENEFIT_CATEGORY_EXHAUSTED. */
  reasonCode: string | null;
}

const EPSILON = 0.01;

const KIND_REASON_CODE: Record<BenefitConstraintKind, string> = {
  PER_VISIT: "BENEFIT_PER_VISIT_EXCEEDED",
  CATEGORY: "BENEFIT_CATEGORY_EXHAUSTED",
  OVERALL: "BENEFIT_OVERALL_EXHAUSTED",
  SHARED_MEMBER: "BENEFIT_SHARED_LIMIT_EXHAUSTED",
  SHARED_FAMILY: "BENEFIT_FAMILY_LIMIT_EXHAUSTED",
};

export class BenefitUsageService {
  /** Enrollment-anniversary benefit period containing `now`. */
  static periodFor(enrollmentDate: Date, now: Date = new Date()): { periodStart: Date; periodEnd: Date } {
    const enroll = new Date(enrollmentDate);
    let periodStart = new Date(now.getFullYear(), enroll.getMonth(), enroll.getDate());
    if (periodStart > now) periodStart = new Date(now.getFullYear() - 1, enroll.getMonth(), enroll.getDate());
    const periodEnd = new Date(periodStart.getFullYear() + 1, enroll.getMonth(), enroll.getDate());
    return { periodStart, periodEnd };
  }

  /**
   * Resolve the member's benefit config + current period for a category.
   * Returns null when the member's package has no config for the category —
   * callers decide whether that blocks (claim approval does, PR-016 #2).
   */
  static async resolveConfig(
    tx: Prisma.TransactionClient,
    memberId: string,
    benefitCategory: BenefitCategory | string,
    now: Date = new Date(),
  ): Promise<ResolvedBenefitConfig | null> {
    const member = await tx.member.findUnique({
      where: { id: memberId },
      select: { packageVersionId: true, enrollmentDate: true },
    });
    if (!member?.packageVersionId) return null;

    const config = await tx.benefitConfig.findFirst({
      where: { packageVersionId: member.packageVersionId, category: benefitCategory as BenefitCategory },
      select: { id: true, annualSubLimit: true },
    });
    if (!config) return null;

    const { periodStart, periodEnd } = this.periodFor(member.enrollmentDate, now);
    return {
      configId: config.id,
      benefitCategory: String(benefitCategory),
      annualSubLimit: Number(config.annualSubLimit),
      periodStart,
      periodEnd,
    };
  }

  /**
   * FG-C10 core arithmetic: reconcile a *stored* activeHoldAmount against live
   * hold expiry.
   *
   * The stored activeHoldAmount is only decremented when the worker releases an
   * expired hold (`releaseExpiredHolds`). If the worker is down or lagging,
   * expired holds keep inflating it → members are silently over-reserved and
   * claims wrongly declined "insufficient balance". This recomputes `held` so
   * expiry is reflected live — WITHOUT ever *under*-reserving (which would enable
   * overspend): it can only free benefit that has already expired.
   *
   *   held = max(0, storedHeld − Σ expired-ACTIVE holds, Σ non-expired-ACTIVE holds)
   *
   * - Subtracting only provably-expired ACTIVE holds means a still-active hold is
   *   never dropped; when nothing is expired `held === storedHeld` (available
   *   unchanged — it never exceeds `limit − used − storedHeld`).
   * - Flooring at the live sum of non-expired holds means a stored value that has
   *   drifted *below* the real obligation can only be corrected upward, never
   *   downward — the result is always ≥ the true active reservation.
   */
  static reconcileStored(storedHeld: number, sums?: { expired: number; active: number }): number {
    return Math.max(0, storedHeld - (sums?.expired ?? 0), sums?.active ?? 0);
  }

  /** Stable key for the per-(member, category) live-hold sums map. */
  static holdKey(memberId: string, benefitCategory: string): string {
    return `${memberId}::${benefitCategory}`;
  }

  /**
   * FG-C10: expired/active ACTIVE-hold sums for many members in ONE query,
   * grouped by (memberId, benefitCategory) via `holdKey`. Bulk read paths (offline
   * pack, sync re-validation, the PA balance surface) reconcile each stored held
   * with `reconcileStored` instead of trusting the worker-maintained amount.
   */
  static async liveHoldSums(
    tx: Prisma.TransactionClient,
    memberIds: string[],
    now: Date = new Date(),
  ): Promise<Map<string, { expired: number; active: number }>> {
    const map = new Map<string, { expired: number; active: number }>();
    if (memberIds.length === 0) return map;
    const holds = await tx.benefitHold.findMany({
      where: { memberId: { in: memberIds }, status: "ACTIVE" },
      select: { memberId: true, benefitCategory: true, heldAmount: true, expiresAt: true },
    });
    for (const h of holds) {
      const key = this.holdKey(h.memberId, h.benefitCategory);
      const cur = map.get(key) ?? { expired: 0, active: 0 };
      const amount = Number(h.heldAmount);
      if (h.expiresAt <= now) cur.expired += amount;
      else cur.active += amount;
      map.set(key, cur);
    }
    return map;
  }

  /** Single-key live reconciliation (sums across `categories` for one member). */
  private static async reconcileHeld(
    tx: Prisma.TransactionClient,
    memberId: string,
    categories: string[],
    storedHeld: number,
    now: Date = new Date(),
  ): Promise<number> {
    const holds = await tx.benefitHold.findMany({
      where: { memberId, benefitCategory: { in: categories }, status: "ACTIVE" },
      select: { heldAmount: true, expiresAt: true },
    });
    let expired = 0;
    let active = 0;
    for (const h of holds) {
      const amount = Number(h.heldAmount);
      if (h.expiresAt <= now) expired += amount;
      else active += amount;
    }
    return this.reconcileStored(storedHeld, { expired, active });
  }

  /** Upsert the (member, config, period) row and apply the given deltas. */
  private static async applyDelta(
    tx: Prisma.TransactionClient,
    memberId: string,
    cfg: ResolvedBenefitConfig,
    delta: { amountUsed?: number; activeHoldAmount?: number; claimCount?: number },
  ) {
    const existing = await tx.benefitUsage.findUnique({
      where: {
        memberId_benefitConfigId_periodStart: {
          memberId,
          benefitConfigId: cfg.configId,
          periodStart: cfg.periodStart,
        },
      },
    });
    if (existing) {
      return tx.benefitUsage.update({
        where: { id: existing.id },
        data: {
          ...(delta.amountUsed ? { amountUsed: { increment: delta.amountUsed } } : {}),
          ...(delta.activeHoldAmount ? { activeHoldAmount: { increment: delta.activeHoldAmount } } : {}),
          ...(delta.claimCount ? { claimCount: { increment: delta.claimCount } } : {}),
          lastUpdated: new Date(),
        },
      });
    }
    try {
      return await tx.benefitUsage.create({
        data: {
          memberId,
          benefitConfigId: cfg.configId,
          periodStart: cfg.periodStart,
          periodEnd: cfg.periodEnd,
          amountUsed: Math.max(0, delta.amountUsed ?? 0),
          activeHoldAmount: Math.max(0, delta.activeHoldAmount ?? 0),
          claimCount: Math.max(0, delta.claimCount ?? 0),
        },
      });
    } catch (err) {
      // P1: two serializable transactions can race the FIRST-EVER row for this
      // (member, config, period) key — the loser lands here with a unique
      // violation instead of a serialization failure. Apply the delta to the
      // row the winner created; anything else rethrows.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return tx.benefitUsage.update({
          where: {
            memberId_benefitConfigId_periodStart: {
              memberId,
              benefitConfigId: cfg.configId,
              periodStart: cfg.periodStart,
            },
          },
          data: {
            ...(delta.amountUsed ? { amountUsed: { increment: delta.amountUsed } } : {}),
            ...(delta.activeHoldAmount ? { activeHoldAmount: { increment: delta.activeHoldAmount } } : {}),
            ...(delta.claimCount ? { claimCount: { increment: delta.claimCount } } : {}),
            lastUpdated: new Date(),
          },
        });
      }
      throw err;
    }
  }

  /**
   * Record consumed usage at claim decision (PR-016 D1): +amountUsed,
   * +claimCount. Returns the remaining limit after the write (shared-limit
   * groups included).
   *
   * P1 gap #2: the write is a GUARDED ledger entry — an amount above the
   * remaining member-scope limit throws instead of incrementing-and-flooring.
   * Callers (ClaimDecisionService.decide) run the full constraint gate first
   * (family pools, overall cap, holds credited); this is the fail-closed
   * backstop that keeps ANY future caller from over-consuming.
   */
  static async recordUsage(
    tx: Prisma.TransactionClient,
    memberId: string,
    benefitCategory: BenefitCategory | string,
    amount: number,
    opts: { serviceDate?: Date } = {},
  ): Promise<{ configId: string; remaining: number }> {
    const cfg = await this.resolveConfig(tx, memberId, benefitCategory, opts.serviceDate ?? new Date());
    if (!cfg) {
      throw new Error(
        `Benefit "${String(benefitCategory).replace(/_/g, " ")}" is not configured in the member's package — cannot record utilisation.`,
      );
    }
    const remainingBefore = await this.remainingAfter(tx, memberId, cfg);
    if (amount > remainingBefore + EPSILON) {
      throw new Error(
        `[BENEFIT_CATEGORY_EXHAUSTED] Recording ${amount.toLocaleString()} would exceed the member's remaining ` +
          `${String(benefitCategory).replace(/_/g, " ")} benefit (${remainingBefore.toLocaleString()} left of ` +
          `${cfg.annualSubLimit.toLocaleString()}). The decision must not consume more than is available.`,
      );
    }
    await this.applyDelta(tx, memberId, cfg, { amountUsed: amount, claimCount: 1 });
    return { configId: cfg.configId, remaining: Math.max(0, remainingBefore - amount) };
  }

  /**
   * Compensating decrement for VOID / appeal reversal (PR-016 #6). Never a
   * destructive rewrite — an explicit negative delta, audit-linked by the caller.
   */
  static async reverseUsage(
    tx: Prisma.TransactionClient,
    memberId: string,
    benefitCategory: BenefitCategory | string,
    amount: number,
  ): Promise<void> {
    const cfg = await this.resolveConfig(tx, memberId, benefitCategory);
    if (!cfg) return; // nothing recorded → nothing to reverse
    await this.applyDelta(tx, memberId, cfg, { amountUsed: -amount, claimCount: -1 });
  }

  /** Place a hold: +activeHoldAmount on the scoped row (upserted). PR-011. */
  static async placeHold(
    tx: Prisma.TransactionClient,
    memberId: string,
    benefitCategory: BenefitCategory | string,
    amount: number,
  ): Promise<void> {
    const cfg = await this.resolveConfig(tx, memberId, benefitCategory);
    if (!cfg) return; // no config — hold row still exists on BenefitHold; nothing to reserve against
    await this.applyDelta(tx, memberId, cfg, { activeHoldAmount: amount });
  }

  /** Release (or convert) a hold: −activeHoldAmount on the scoped row. */
  static async releaseHold(
    tx: Prisma.TransactionClient,
    memberId: string,
    benefitCategory: BenefitCategory | string,
    amount: number,
  ): Promise<void> {
    const cfg = await this.resolveConfig(tx, memberId, benefitCategory);
    if (!cfg) return;
    await this.applyDelta(tx, memberId, cfg, { activeHoldAmount: -amount });
  }

  /**
   * Remaining limit for the config's current period:
   * annualSubLimit − amountUsed − activeHoldAmount, additionally bounded by any
   * shared-limit group the config belongs to (PR-011 #4).
   */
  static async remainingAfter(
    tx: Prisma.TransactionClient,
    memberId: string,
    cfg: ResolvedBenefitConfig,
  ): Promise<number> {
    const row = await tx.benefitUsage.findUnique({
      where: {
        memberId_benefitConfigId_periodStart: {
          memberId,
          benefitConfigId: cfg.configId,
          periodStart: cfg.periodStart,
        },
      },
    });
    const used = Number(row?.amountUsed ?? 0);
    // FG-C10: reconcile stored held against live hold expiry (never under-reserve).
    const held = await this.reconcileHeld(tx, memberId, [cfg.benefitCategory], Number(row?.activeHoldAmount ?? 0));
    let remaining = Math.max(0, cfg.annualSubLimit - used - held);

    // Shared-limit groups: the joint pool may be tighter than the sub-limit.
    const links = await tx.benefitConfigSharedLimit.findMany({
      where: { benefitConfigId: cfg.configId },
      include: { sharedLimitGroup: { include: { benefitConfigs: true } } },
    });
    for (const link of links) {
      const group = link.sharedLimitGroup;
      const configIds = group.benefitConfigs.map((bc) => bc.benefitConfigId);
      const groupRows = await tx.benefitUsage.findMany({
        where: { memberId, benefitConfigId: { in: configIds }, periodStart: cfg.periodStart },
      });
      // FG-C10: reconcile the pooled held against expiry too, keyed by the
      // categories of the group's configs — a down worker would otherwise
      // over-reserve the shared pool exactly as it over-reserves the sub-limit.
      const groupConfigs = await tx.benefitConfig.findMany({
        where: { id: { in: configIds } },
        select: { category: true },
      });
      const groupCategories = groupConfigs.map((c) => String(c.category));
      const groupStoredHeld = groupRows.reduce((s, u) => s + Number(u.activeHoldAmount), 0);
      const groupHeld = await this.reconcileHeld(tx, memberId, groupCategories, groupStoredHeld);
      const groupUsed = groupRows.reduce((s, u) => s + Number(u.amountUsed), 0) + groupHeld;
      remaining = Math.min(remaining, Math.max(0, Number(group.limitAmount) - groupUsed));
    }
    return remaining;
  }

  /**
   * P1.1 — THE availability result. One computation, minimum across every
   * applicable constraint, reason-ready detail per constraint:
   *
   *   PER_VISIT      BenefitConfig.perVisitLimit / Package.perVisitLimit
   *   CATEGORY       annualSubLimit − used − held (holds expiry-reconciled)
   *   OVERALL        Package.annualLimit across all categories (DEC-03, when > 0)
   *   SHARED_MEMBER  SharedLimitGroup pool, treated member only
   *   SHARED_FAMILY  SharedLimitGroup pool across principal + dependants (DEC-05)
   *
   * `creditPreauthIds` names the PAs whose ACTIVE holds THIS decision converts —
   * their reservations are credited back once (P1.1 rule 5) so a hold-covered
   * claim is never false-blocked by its own reservation.
   *
   * The period is anchored to the treated member's enrollment anniversary and
   * resolved for the SERVICE DATE (P1.1 rule 1). Family aggregation matches
   * rows overlapping that window (family members may have different
   * anniversaries).
   *
   * DEC-06: a dependant with no resolvable principal fails CLOSED when a
   * FAMILY pool applies — blocking error + ExceptionLog data-quality row.
   *
   * Returns null when the member's package has no config for the category —
   * the benefit-in-package gate owns that message.
   */
  static async computeAvailability(
    tx: Prisma.TransactionClient,
    opts: {
      memberId: string;
      benefitCategory: BenefitCategory | string;
      requestedAmount: number;
      serviceDate?: Date;
      creditPreauthIds?: string[];
      /** For the DEC-06 ExceptionLog row; omitted → throw only. */
      tenantId?: string;
      actorId?: string;
    },
  ): Promise<BenefitAvailability | null> {
    const now = opts.serviceDate ?? new Date();
    const member = await tx.member.findUnique({
      where: { id: opts.memberId },
      select: {
        id: true,
        relationship: true,
        principalId: true,
        enrollmentDate: true,
        packageVersionId: true,
        package: { select: { annualLimit: true, perVisitLimit: true } },
      },
    });
    if (!member?.packageVersionId) return null;

    const config = await tx.benefitConfig.findFirst({
      where: { packageVersionId: member.packageVersionId, category: opts.benefitCategory as BenefitCategory },
      select: { id: true, annualSubLimit: true, perVisitLimit: true },
    });
    if (!config) return null;

    const { periodStart, periodEnd } = this.periodFor(member.enrollmentDate, now);
    const category = String(opts.benefitCategory);
    const familyRootId = member.relationship === "PRINCIPAL" ? opts.memberId : member.principalId ?? opts.memberId;

    // Credited holds (the ones this decision converts), keyed per member+category.
    const creditByKey = new Map<string, number>();
    if (opts.creditPreauthIds && opts.creditPreauthIds.length > 0) {
      const credited = await tx.benefitHold.findMany({
        where: { preAuthId: { in: opts.creditPreauthIds }, status: "ACTIVE" },
        select: { memberId: true, benefitCategory: true, heldAmount: true },
      });
      for (const h of credited) {
        const key = this.holdKey(h.memberId, h.benefitCategory);
        creditByKey.set(key, (creditByKey.get(key) ?? 0) + Number(h.heldAmount));
      }
    }

    /** Reconciled, credit-netted held across usage rows (local credit copy per constraint). */
    const heldAcross = (
      rows: Array<{ memberId: string; activeHoldAmount: unknown; category: string }>,
      sums: Map<string, { expired: number; active: number }>,
    ): number => {
      const credits = new Map(creditByKey);
      let total = 0;
      for (const row of rows) {
        const key = this.holdKey(row.memberId, row.category);
        const reconciled = this.reconcileStored(Number(row.activeHoldAmount), sums.get(key));
        const credit = Math.min(credits.get(key) ?? 0, reconciled);
        credits.set(key, (credits.get(key) ?? 0) - credit);
        total += reconciled - credit;
      }
      return total;
    };

    const constraints: BenefitConstraint[] = [];

    // PER_VISIT — a per-claim cap, not a depleting pool.
    const cfgPerVisit = config.perVisitLimit != null ? Number(config.perVisitLimit) : null;
    if (cfgPerVisit != null && cfgPerVisit > 0) {
      constraints.push({ kind: "PER_VISIT", label: `${category.replace(/_/g, " ")} per-visit limit`, limit: cfgPerVisit, used: 0, held: 0, available: cfgPerVisit });
    }
    const pkgPerVisit = member.package?.perVisitLimit != null ? Number(member.package.perVisitLimit) : null;
    if (pkgPerVisit != null && pkgPerVisit > 0) {
      constraints.push({ kind: "PER_VISIT", label: "Package per-visit limit", limit: pkgPerVisit, used: 0, held: 0, available: pkgPerVisit });
    }

    // CATEGORY — the member's own sublimit row.
    const memberSums = await this.liveHoldSums(tx, [opts.memberId], now);
    const catRow = await tx.benefitUsage.findUnique({
      where: { memberId_benefitConfigId_periodStart: { memberId: opts.memberId, benefitConfigId: config.id, periodStart } },
    });
    const catUsed = Number(catRow?.amountUsed ?? 0);
    const catHeld = heldAcross(
      [{ memberId: opts.memberId, activeHoldAmount: catRow?.activeHoldAmount ?? 0, category }],
      memberSums,
    );
    const catLimit = Number(config.annualSubLimit);
    constraints.push({
      kind: "CATEGORY",
      label: `${category.replace(/_/g, " ")} annual sublimit`,
      limit: catLimit,
      used: catUsed,
      held: catHeld,
      available: Math.max(0, catLimit - catUsed - catHeld),
    });

    // OVERALL — Package.annualLimit across all categories (DEC-03, when populated).
    const overallLimit = member.package?.annualLimit != null ? Number(member.package.annualLimit) : 0;
    if (overallLimit > 0) {
      const allRows = await tx.benefitUsage.findMany({
        where: { memberId: opts.memberId, periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart } },
        include: { benefitConfig: { select: { category: true } } },
      });
      const shaped = allRows.map((r) => ({
        memberId: opts.memberId,
        activeHoldAmount: r.activeHoldAmount,
        category: String((r as { benefitConfig?: { category?: unknown } }).benefitConfig?.category ?? ""),
      }));
      const overallUsed = allRows.reduce((s, r) => s + Number(r.amountUsed), 0);
      const overallHeld = heldAcross(shaped, memberSums);
      constraints.push({
        kind: "OVERALL",
        label: "Package overall annual limit",
        limit: overallLimit,
        used: overallUsed,
        held: overallHeld,
        available: Math.max(0, overallLimit - overallUsed - overallHeld),
      });
    }

    // SHARED pools — MEMBER-scoped or FAMILY-scoped (DEC-05/06).
    const links = await tx.benefitConfigSharedLimit.findMany({
      where: { benefitConfigId: config.id },
      include: { sharedLimitGroup: { include: { benefitConfigs: true } } },
    });
    let familyIds: string[] | null = null;
    for (const link of links) {
      const group = link.sharedLimitGroup;
      const isFamily = group.appliesTo === "FAMILY";

      if (isFamily && member.relationship !== "PRINCIPAL" && !member.principalId) {
        // DEC-06: fail closed + data-quality exception.
        if (opts.tenantId && opts.actorId) {
          await tx.exceptionLog
            .create({
              data: {
                tenantId: opts.tenantId,
                entityType: "MEMBER",
                entityId: opts.memberId,
                entityRef: opts.memberId,
                exceptionCode: "OTHER",
                reason: `Family shared limit "${group.name}" cannot be computed: dependant ${opts.memberId} has no linked principal (data quality). Decision blocked (DEC-06).`,
                raisedById: opts.actorId,
              },
            })
            .catch(() => undefined);
        }
        throw new Error(
          `Family shared limit "${group.name}" cannot be computed: this dependant has no linked principal member (data-quality issue). ` +
            `Correct the member's principal linkage (Members → dependants) before deciding — the family pool cannot be safely calculated.`,
        );
      }

      const scopeIds = isFamily
        ? (familyIds ??= (
            await tx.member.findMany({
              where: { OR: [{ id: familyRootId }, { principalId: familyRootId }] },
              select: { id: true },
            })
          ).map((m) => m.id))
        : [opts.memberId];

      const configIds = group.benefitConfigs.map((bc) => bc.benefitConfigId);
      const poolRows = await tx.benefitUsage.findMany({
        where: {
          memberId: scopeIds.length === 1 ? scopeIds[0] : { in: scopeIds },
          benefitConfigId: { in: configIds },
          periodStart: { lte: periodEnd },
          periodEnd: { gte: periodStart },
        },
        include: { benefitConfig: { select: { category: true } } },
      });
      const sums = isFamily ? await this.liveHoldSums(tx, scopeIds, now) : memberSums;
      const shaped = poolRows.map((r) => ({
        memberId: (r as { memberId: string }).memberId,
        activeHoldAmount: r.activeHoldAmount,
        category: String((r as { benefitConfig?: { category?: unknown } }).benefitConfig?.category ?? ""),
      }));
      const poolUsed = poolRows.reduce((s, r) => s + Number(r.amountUsed), 0);
      const poolHeld = heldAcross(shaped, sums);
      const poolLimit = Number(group.limitAmount);
      constraints.push({
        kind: isFamily ? "SHARED_FAMILY" : "SHARED_MEMBER",
        label: group.name,
        limit: poolLimit,
        used: poolUsed,
        held: poolHeld,
        available: Math.max(0, poolLimit - poolUsed - poolHeld),
      });
    }

    const binding = constraints.reduce<BenefitConstraint | null>(
      (min, c) => (min === null || c.available < min.available ? c : min),
      null,
    );
    const payableCeiling = binding?.available ?? 0;

    return {
      memberId: opts.memberId,
      familyRootId,
      benefitConfigId: config.id,
      benefitCategory: category,
      periodStart,
      periodEnd,
      requestedAmount: opts.requestedAmount,
      payableCeiling,
      constraints,
      binding,
      reasonCode: binding ? KIND_REASON_CODE[binding.kind] : null,
    };
  }

  /** Available limit before any new commitment (PR-011 #4 read path). */
  static async availableLimit(
    tx: Prisma.TransactionClient,
    memberId: string,
    benefitCategory: BenefitCategory | string,
  ): Promise<{ configId: string; limit: number; used: number; held: number; available: number } | null> {
    const cfg = await this.resolveConfig(tx, memberId, benefitCategory);
    if (!cfg) return null;
    const row = await tx.benefitUsage.findUnique({
      where: {
        memberId_benefitConfigId_periodStart: {
          memberId,
          benefitConfigId: cfg.configId,
          periodStart: cfg.periodStart,
        },
      },
    });
    const used = Number(row?.amountUsed ?? 0);
    // FG-C10: reconcile stored held against live hold expiry (never under-reserve).
    const held = await this.reconcileHeld(tx, memberId, [cfg.benefitCategory], Number(row?.activeHoldAmount ?? 0));
    return {
      configId: cfg.configId,
      limit: cfg.annualSubLimit,
      used,
      held,
      available: Math.max(0, cfg.annualSubLimit - used - held),
    };
  }
}
