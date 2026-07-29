import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";
import { CapitationError, type CapitationActor } from "./arrangement.service";

/**
 * PNOS F10.3 — eligible-life snapshot.
 *
 * ONE idempotent period snapshot that records exactly which covered lives qualify
 * and WHY, at the arrangement's configured snapshot instant, from CANONICAL
 * coverage (MemberCoveragePeriod) + member status + scope. A re-run over identical
 * facts is a no-op (same control hash); a late coverage change recomputes a DRAFT
 * snapshot. Freezing locks the roster (DRAFT → CALCULATED) with a completeness
 * check. NO accrual (F10.3 stop — accrual is F10.4). GATED behind F10.1.
 */

const MANAGER_ROLES = new Set(["SUPER_ADMIN", "FINANCE_OFFICER"]);
function requireManager(actor: CapitationActor) {
  if (!MANAGER_ROLES.has(actor.role)) throw new CapitationError("FORBIDDEN", "Capitation management requires a finance role.");
}

export type EligibleReason = "COVERED" | "NOT_ACTIVE" | "NO_COVERAGE_ON_SNAPSHOT_DAY";

export interface SnapshotResult {
  count: number; // included lives
  total: number; // candidates classified
  controlHash: string;
  changed: boolean; // false when a replay produced an identical roster
  snapshotInstant: Date;
}

export const EligibleLifeSnapshotService = {
  /**
   * Compute (or recompute, while DRAFT) the eligible-life roster for a period.
   * Idempotent: an identical roster leaves the persisted snapshot untouched.
   */
  async computeSnapshot(actor: CapitationActor, periodId: string, opts: { snapshotInstant?: Date } = {}): Promise<SnapshotResult> {
    requireManager(actor);
    const period = await prisma.capitationPeriod.findFirst({
      where: { id: periodId, tenantId: actor.tenantId },
      select: { id: true, status: true, periodStart: true, snapshotInstant: true, eligibleLifeControlHash: true, arrangement: { select: { clientId: true, groupId: true, packageId: true, eligibilityDefinitionVersion: true } } },
    });
    if (!period) throw new CapitationError("NOT_FOUND", "No such period.");
    if (period.status !== "DRAFT") throw new CapitationError("PERIOD_IMMUTABLE", `Period is ${period.status}; the eligible-life snapshot recomputes only while DRAFT.`);

    const arr = period.arrangement;
    const snapshotInstant = opts.snapshotInstant ?? period.snapshotInstant ?? period.periodStart;

    // Candidate members in the arrangement's scope (group/package direct, or the
    // client's groups when only a client is scoped).
    const memberWhere: Record<string, unknown> = { tenantId: actor.tenantId };
    if (arr.groupId) memberWhere.groupId = arr.groupId;
    if (arr.packageId) memberWhere.packageId = arr.packageId;
    if (arr.clientId && !arr.groupId) memberWhere.group = { clientId: arr.clientId };

    const members = await prisma.member.findMany({ where: memberWhere, select: { id: true, status: true } });

    // Classify each candidate from canonical coverage on the snapshot instant.
    const rows: Array<{ memberId: string; included: boolean; reasonCode: EligibleReason }> = [];
    for (const m of members) {
      if (m.status !== "ACTIVE") {
        rows.push({ memberId: m.id, included: false, reasonCode: "NOT_ACTIVE" });
        continue;
      }
      const covered = await prisma.memberCoveragePeriod.findFirst({
        where: { memberId: m.id, startDate: { lte: snapshotInstant }, OR: [{ endDate: null }, { endDate: { gte: snapshotInstant } }] },
        select: { id: true },
      });
      rows.push(covered ? { memberId: m.id, included: true, reasonCode: "COVERED" } : { memberId: m.id, included: false, reasonCode: "NO_COVERAGE_ON_SNAPSHOT_DAY" });
    }

    // Deterministic control hash over the sorted (member, included, reason) set.
    const sorted = rows.slice().sort((a, b) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));
    const controlHash = createHash("sha256").update(sorted.map((r) => `${r.memberId}:${r.included ? 1 : 0}:${r.reasonCode}`).join("|")).digest("hex");
    const count = rows.filter((r) => r.included).length;

    // Idempotent replay: identical hash ⇒ leave the persisted snapshot untouched.
    if (period.eligibleLifeControlHash === controlHash) {
      return { count, total: rows.length, controlHash, changed: false, snapshotInstant };
    }

    await prisma.$transaction(async (tx) => {
      await tx.capitationEligibleLife.deleteMany({ where: { periodId } });
      if (rows.length > 0) {
        await tx.capitationEligibleLife.createMany({ data: rows.map((r) => ({ tenantId: actor.tenantId, periodId, memberId: r.memberId, included: r.included, reasonCode: r.reasonCode, coverageSourceVersion: arr.eligibilityDefinitionVersion })) });
      }
      await tx.capitationPeriod.update({ where: { id: periodId }, data: { snapshotInstant, eligibleLifeCount: count, eligibleLifeControlHash: controlHash } });
    });
    return { count, total: rows.length, controlHash, changed: true, snapshotInstant };
  },

  /**
   * Freeze the eligible-life snapshot: DRAFT → CALCULATED (the roster/count/hash lock;
   * accrual computes next, F10.4). Completeness check: a snapshot must have been
   * computed (control hash present).
   */
  async freezeSnapshot(actor: CapitationActor, periodId: string) {
    requireManager(actor);
    const period = await prisma.capitationPeriod.findFirst({ where: { id: periodId, tenantId: actor.tenantId }, select: { id: true, status: true, eligibleLifeControlHash: true } });
    if (!period) throw new CapitationError("NOT_FOUND", "No such period.");
    if (period.status !== "DRAFT") throw new CapitationError("PERIOD_IMMUTABLE", `Period is ${period.status}; the snapshot is already frozen.`);
    if (!period.eligibleLifeControlHash) throw new CapitationError("INVALID_INPUT", "Compute the eligible-life snapshot before freezing.");
    return prisma.capitationPeriod.update({ where: { id: periodId }, data: { status: "CALCULATED" } });
  },
} as const;
