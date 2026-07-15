import type { Prisma, BenefitCategory } from "@prisma/client";

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
    return tx.benefitUsage.create({
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
  }

  /**
   * Record consumed usage at claim decision (PR-016 D1): +amountUsed,
   * +claimCount. Returns the remaining limit after the write (shared-limit
   * groups included).
   */
  static async recordUsage(
    tx: Prisma.TransactionClient,
    memberId: string,
    benefitCategory: BenefitCategory | string,
    amount: number,
  ): Promise<{ configId: string; remaining: number }> {
    const cfg = await this.resolveConfig(tx, memberId, benefitCategory);
    if (!cfg) {
      throw new Error(
        `Benefit "${String(benefitCategory).replace(/_/g, " ")}" is not configured in the member's package — cannot record utilisation.`,
      );
    }
    await this.applyDelta(tx, memberId, cfg, { amountUsed: amount, claimCount: 1 });
    const remaining = await this.remainingAfter(tx, memberId, cfg);
    return { configId: cfg.configId, remaining };
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
