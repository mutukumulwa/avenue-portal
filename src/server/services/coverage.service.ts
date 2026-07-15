import type { Prisma } from "@prisma/client";

/**
 * coverage.service.ts — point-in-time membership coverage (FG-C5).
 *
 * Eligibility must be resolvable AS OF a service date, not by current status:
 * a member terminated today was still covered for a service they received last
 * month. `MemberCoveragePeriod` records coverage history as explicit
 * [startDate, endDate?] windows (endDate NULL = currently open). This service is
 * the single home for reading (`evaluate`) and maintaining (`openPeriod`,
 * `closeOpenPeriods`) that history, so the claim rails and the lifecycle
 * transitions stay consistent.
 *
 * Rollout is fail-open: `evaluate` reports `hasPeriods:false` for a member with
 * no periods yet (pre-backfill, or a creation path not wired to `openPeriod`) so
 * callers keep their legacy current-status / cover-start gate rather than
 * wrongly blocking every claim.
 */

export type CoverageEvaluation = {
  /** false → the member has no periods yet; caller should use its legacy gate. */
  hasPeriods: boolean;
  /** true → serviceDate falls within some [startDate, endDate?] period. */
  covered: boolean;
};

/**
 * Statuses that mean coverage has ENDED (as opposed to a transient hold like
 * SUSPENDED). For these, callers pass `ignoreOpenPeriods` to `evaluate` so an
 * un-closed (endDate NULL) period is NOT treated as cover — a member whose
 * termination path didn't close their period fails safe to the legacy gate
 * (a wrong-decline) instead of leaking cover for post-termination service dates.
 */
export const COVERAGE_ENDED_STATUSES = [
  "TERMINATED",
  "TERMINATED_FRAUD",
  "TERMINATED_BREACH",
  "TERMINATED_DEATH",
  "CANCELLED_COOLING_OFF",
  "EXPIRED",
  "LAPSED_BEFORE_ACTIVATION",
] as const;

export function isCoverageEnded(status: string): boolean {
  return (COVERAGE_ENDED_STATUSES as readonly string[]).includes(status);
}

export const coverageService = {
  async evaluate(
    tx: Prisma.TransactionClient,
    memberId: string,
    serviceDate: Date,
    opts?: { ignoreOpenPeriods?: boolean },
  ): Promise<CoverageEvaluation> {
    const periods = await tx.memberCoveragePeriod.findMany({
      where: { memberId },
      select: { startDate: true, endDate: true },
    });
    if (periods.length === 0) return { hasPeriods: false, covered: false };
    const covered = periods.some((p) => {
      if (serviceDate < p.startDate) return false;
      // An open period counts as cover only when the member's current status has
      // not ended coverage; a terminal member is covered only by a *closed* window.
      if (p.endDate === null) return !opts?.ignoreOpenPeriods;
      return serviceDate <= p.endDate;
    });
    return { hasPeriods: true, covered };
  },

  /**
   * Open a coverage period from `startDate` if the member has no open one.
   * Idempotent: a member already open (an endDate-NULL row) is left untouched,
   * so re-running binding/activation/reinstatement never stacks periods.
   */
  async openPeriod(
    tx: Prisma.TransactionClient,
    tenantId: string,
    memberId: string,
    startDate: Date,
    reason: string,
  ): Promise<void> {
    const open = await tx.memberCoveragePeriod.findFirst({
      where: { memberId, endDate: null },
      select: { id: true },
    });
    if (open) return;
    await tx.memberCoveragePeriod.create({
      data: { tenantId, memberId, startDate, reason },
    });
  },

  /**
   * Close every open period at `endDate` (idempotent — no open period → no-op).
   * `endDate` is floored at each period's `startDate`, so a same-day or
   * back-dated termination still yields a valid inclusive window rather than an
   * inverted one.
   */
  async closeOpenPeriods(
    tx: Prisma.TransactionClient,
    memberId: string,
    endDate: Date,
    reason: string,
  ): Promise<void> {
    const open = await tx.memberCoveragePeriod.findMany({
      where: { memberId, endDate: null },
      select: { id: true, startDate: true },
    });
    for (const p of open) {
      const effectiveEnd = endDate < p.startDate ? p.startDate : endDate;
      await tx.memberCoveragePeriod.update({
        where: { id: p.id },
        data: { endDate: effectiveEnd, reason },
      });
    }
  },
};
