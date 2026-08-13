/**
 * UAT-HF P09.06 — the migration half of "archive through dependency impact
 * **and migration control**" (DEF-025).
 *
 * The first pass built the impact report: archiving now names the schemes and
 * the member count and demands an acknowledgement. Its recorded gap was the
 * other half — "offering to move the affected schemes to a successor package,
 * and that is not built; the operator is told what will be stranded and must
 * move them by hand."
 *
 * Moving them by hand is the failure mode. An operator who archives a package
 * bound to four schemes and then repoints three of them has left one scheme
 * pointing at an archived package — P09.06's acceptance calls that a "dangling
 * current reference", and nothing in the product would surface it again.
 *
 * ## What a migration moves, and what it deliberately does not
 *
 * Schemes and benefit tiers are **configuration pointers**: which package a
 * scheme offers. Repointing them changes what future enrolments get and strands
 * nobody.
 *
 * Members are **people with cover**. Repointing a member changes the benefits
 * they can claim against, so it is a cover change, and this branch's standing
 * rule is that cover changes are governed rather than incidental. A migration
 * therefore moves members only when the caller passes `moveMembers`, which the
 * UI gates behind its own typed confirmation naming the count — and it writes
 * one audit row recording exactly how many people were moved and from what.
 *
 * ## One transaction, or it is worse than doing nothing
 *
 * A partial migration is the exact state the control exists to prevent. Every
 * repoint happens in a single `$transaction`, so either every dependency moves
 * or none does and the package stays un-archived.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface MigrationPlan {
  /** Schemes whose `packageId` points directly at the package being archived. */
  schemeCount: number;
  /** Benefit tiers pointing at it. */
  tierCount: number;
  /** Members enrolled on it. */
  memberCount: number;
  successorId: string;
  successorName: string;
  /** The successor's current version, which migrated members are pinned to. */
  successorVersionId: string | null;
}

export type MigrationRefusal =
  | { ok: false; reason: "SUCCESSOR_MISSING"; message: string }
  | { ok: false; reason: "SUCCESSOR_SAME"; message: string }
  | { ok: false; reason: "SUCCESSOR_NOT_USABLE"; message: string }
  | { ok: false; reason: "MEMBERS_NOT_AUTHORISED"; message: string };

export type MigrationPlanResult = { ok: true; plan: MigrationPlan } | MigrationRefusal;

/**
 * Validate a proposed successor and describe what moving to it would do.
 *
 * Read-only. Called before the operator commits so the confirmation can state
 * real numbers, and again inside the write path — a successor archived between
 * the two would otherwise migrate schemes onto a second dead package.
 */
export async function planPackageMigration(input: {
  tenantId: string;
  packageId: string;
  successorId: string;
  moveMembers: boolean;
}): Promise<MigrationPlanResult> {
  const { tenantId, packageId, successorId } = input;

  if (successorId === packageId) {
    return {
      ok: false,
      reason: "SUCCESSOR_SAME",
      message: "The successor cannot be the package being archived.",
    };
  }

  const successor = await prisma.package.findFirst({
    where: { id: successorId, tenantId },
    select: { id: true, name: true, status: true, currentVersionId: true },
  });

  if (!successor) {
    return {
      ok: false,
      reason: "SUCCESSOR_MISSING",
      message: "That successor package was not found.",
    };
  }

  // Migrating onto a DRAFT or ARCHIVED package moves the problem rather than
  // solving it — the schemes would still point at something nobody can enrol on.
  if (successor.status !== "ACTIVE") {
    return {
      ok: false,
      reason: "SUCCESSOR_NOT_USABLE",
      message: `"${successor.name}" is ${successor.status.toLowerCase()}, so schemes moved onto it would still have no usable package. Choose an active package.`,
    };
  }

  const [schemeCount, tierCount, memberCount] = await Promise.all([
    prisma.group.count({ where: { tenantId, packageId } }),
    prisma.groupBenefitTier.count({ where: { packageId, group: { tenantId } } }),
    prisma.member.count({ where: { tenantId, packageId } }),
  ]);

  if (memberCount > 0 && !input.moveMembers) {
    return {
      ok: false,
      reason: "MEMBERS_NOT_AUTHORISED",
      message: `${memberCount} member${memberCount === 1 ? " is" : "s are"} enrolled on this package. Moving them changes the benefits they can claim against, so it needs its own confirmation — or move them off the package first.`,
    };
  }

  return {
    ok: true,
    plan: {
      schemeCount,
      tierCount,
      memberCount,
      successorId: successor.id,
      successorName: successor.name,
      successorVersionId: successor.currentVersionId,
    },
  };
}

export interface MigrationOutcome {
  schemesMoved: number;
  tiersMoved: number;
  membersMoved: number;
  successorId: string;
  successorName: string;
}

/**
 * Repoint every dependency onto the successor, in one transaction.
 *
 * The plan is re-validated inside the caller's flow rather than trusted from
 * the form: the counts shown on screen are a snapshot, and a scheme created in
 * between must move too. `updateMany` is used precisely so the operation is
 * defined over "whatever currently points here" rather than over a list read
 * earlier — a read-then-write would strand exactly the newest scheme.
 */
export async function executePackageMigration(input: {
  tenantId: string;
  packageId: string;
  plan: MigrationPlan;
  moveMembers: boolean;
}): Promise<MigrationOutcome> {
  const { tenantId, packageId, plan } = input;

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const schemes = await tx.group.updateMany({
      where: { tenantId, packageId },
      data: { packageId: plan.successorId },
    });

    const tiers = await tx.groupBenefitTier.updateMany({
      where: { packageId, group: { tenantId } },
      data: { packageId: plan.successorId },
    });

    let membersMoved = 0;
    if (input.moveMembers) {
      const members = await tx.member.updateMany({
        where: { tenantId, packageId },
        data: {
          packageId: plan.successorId,
          // The pin moves with them. Leaving `packageVersionId` on the archived
          // package's version while `packageId` points at the successor is the
          // dangling reference this control exists to prevent — and every
          // benefit lookup reads the pin first, so it would silently keep
          // serving the archived package's limits.
          packageVersionId: plan.successorVersionId,
        },
      });
      membersMoved = members.count;
    }

    return {
      schemesMoved: schemes.count,
      tiersMoved: tiers.count,
      membersMoved,
      successorId: plan.successorId,
      successorName: plan.successorName,
    };
  });
}

/** Hidden field naming the chosen successor package. */
export const MIGRATION_SUCCESSOR_FIELD = "__migrateToPackageId";
/** Hidden field authorising the member half of a migration. */
export const MIGRATION_MOVE_MEMBERS_FIELD = "__migrateMembers";

/** One sentence for the confirmation, stating what will actually happen. */
export function describeMigration(plan: MigrationPlan, moveMembers: boolean): string {
  const parts: string[] = [];
  if (plan.schemeCount > 0) {
    parts.push(`${plan.schemeCount} scheme${plan.schemeCount === 1 ? "" : "s"}`);
  }
  if (plan.tierCount > 0) {
    parts.push(`${plan.tierCount} benefit tier${plan.tierCount === 1 ? "" : "s"}`);
  }
  if (moveMembers && plan.memberCount > 0) {
    parts.push(`${plan.memberCount} enrolled member${plan.memberCount === 1 ? "" : "s"}`);
  }

  if (parts.length === 0) {
    return `Nothing points at this package, so archiving it moves nothing.`;
  }

  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

  const coverNote =
    moveMembers && plan.memberCount > 0
      ? ` Those members' cover changes to the successor package's benefits and limits from the moment this is applied.`
      : "";

  return `${list} will be moved to "${plan.successorName}".${coverNote}`;
}
