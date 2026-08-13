/**
 * UAT-HF P09.01 — draft → approve → activate for package versions (DEF-024).
 *
 * The run: "A single underwriter changed a live ACTIVE package (enabled DENTAL
 * at UGX 10,000) and the change took effect immediately as version v5
 * 'Current', with no approval requested, no Draft/Pending/Approved state, and
 * no feedback message of any kind ... Separation of duties is absent on this
 * object: the checker sees the same package with the same 'Edit' control, so
 * the checker is a second maker rather than a reviewer."
 *
 * And the diagnosis that shapes the fix: "**The approval engine exists and is
 * correctly described on its own page ... and demonstrably works for claim
 * payments — configuration changes are simply not routed into it.**"
 *
 * So nothing new is built here either. `ApprovalMatrixService` already resolves
 * rules and `ApprovalRequestService` already enforces maker ≠ checker; package
 * versions get an `ApprovalActionType` and a lifecycle state so they can enter
 * the same queue that claim payments do.
 *
 * ## What actually closes the defect
 *
 * `Package.currentVersionId` is the pointer eligibility reads. Creating a
 * version and repointing it were one act; they are now two, and only the second
 * is governed. That is the acceptance — "maker save cannot change live member
 * eligibility" — and it holds even if every other part of this file is bypassed,
 * because a DRAFT version is not pointed at by anything.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

export type PackageVersionStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "ACTIVE"
  | "SUPERSEDED"
  | "REJECTED";

/** The approval-matrix action type package activation is routed through. */
export const PACKAGE_ACTIVATION_ACTION = "PACKAGE_VERSION_ACTIVATION" as const;

export type TransitionOutcome =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Which transitions the lifecycle permits.
 *
 * A table rather than scattered `if`s, so "can this move there?" has one answer
 * and a reviewer can read the whole policy in one place.
 */
const ALLOWED: Record<PackageVersionStatus, PackageVersionStatus[]> = {
  DRAFT: ["PENDING_APPROVAL"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "DRAFT"],
  APPROVED: ["ACTIVE", "REJECTED"],
  ACTIVE: ["SUPERSEDED"],
  SUPERSEDED: [],
  REJECTED: ["DRAFT"],
};

export function canTransition(
  from: PackageVersionStatus,
  to: PackageVersionStatus,
): TransitionOutcome {
  if (ALLOWED[from]?.includes(to)) return { ok: true };
  return {
    ok: false,
    reason: `A ${from.replace(/_/g, " ").toLowerCase()} version cannot move to ${to
      .replace(/_/g, " ")
      .toLowerCase()}.`,
  };
}

/**
 * Whether `checkerId` may approve a version submitted by `makerId`.
 *
 * DEC-03: "The maker may not be the checker." The run found the opposite —
 * "the checker is a second maker rather than a reviewer".
 *
 * An unknown maker fails CLOSED. A version with no recorded submitter cannot be
 * shown to have been reviewed by somebody else, and "we could not tell" must not
 * resolve to "approved".
 */
export function mayApprove(makerId: string | null | undefined, checkerId: string): TransitionOutcome {
  if (!makerId) {
    return {
      ok: false,
      reason:
        "This version has no recorded author, so separation of duties cannot be verified. Re-submit it before approving.",
    };
  }
  if (makerId === checkerId) {
    return {
      ok: false,
      reason:
        "You submitted this change, so you cannot approve it. A different authorised checker must review it.",
    };
  }
  return { ok: true };
}

/** True when an approved version's effective date has arrived. */
export function isEffective(effectiveFrom: Date | string, now: Date = new Date()): boolean {
  const from = new Date(effectiveFrom);
  if (Number.isNaN(from.getTime())) return false;
  return now.getTime() >= from.getTime();
}

type Db = Pick<PrismaClient, "packageVersion" | "package">;

/**
 * Activate an approved version: point the package at it and retire the old one.
 *
 * Both writes happen in ONE transaction, and the pointer update is conditional
 * on the version still being APPROVED — so two checkers racing on the same
 * package cannot both activate, and a version that was rejected between the read
 * and the write does not sneak through.
 *
 * Schemes and members are NOT migrated. DEC-03: "Schemes and members stay pinned
 * to their current approved version until a governed migration moves them."
 * Silently moving live members onto a new package version is the very thing the
 * approval is protecting against.
 */
export async function activateApprovedVersion(
  tx: Db,
  input: { packageId: string; versionId: string; now?: Date },
): Promise<TransitionOutcome> {
  const version = await tx.packageVersion.findFirst({
    where: { id: input.versionId, packageId: input.packageId },
    select: { status: true, effectiveFrom: true },
  });
  if (!version) return { ok: false, reason: "That version no longer exists." };

  const move = canTransition(version.status as PackageVersionStatus, "ACTIVE");
  if (!move.ok) return move;

  if (!isEffective(version.effectiveFrom, input.now)) {
    return {
      ok: false,
      reason: `This version is approved but does not take effect until ${new Date(
        version.effectiveFrom,
      ).toISOString().slice(0, 10)}.`,
    };
  }

  // Conditional: only an APPROVED version may become ACTIVE, checked in the
  // WHERE clause so two racing checkers cannot both win.
  const claimed = await tx.packageVersion.updateMany({
    where: { id: input.versionId, status: "APPROVED" },
    data: { status: "ACTIVE" },
  });
  if (claimed.count !== 1) {
    return { ok: false, reason: "That version was actioned by someone else. Reload and check." };
  }

  // Retire whatever was active before — after the claim, so a failed claim
  // leaves the current version alone.
  await tx.packageVersion.updateMany({
    where: { packageId: input.packageId, status: "ACTIVE", NOT: { id: input.versionId } },
    data: { status: "SUPERSEDED" },
  });

  await tx.package.update({
    where: { id: input.packageId },
    data: { currentVersionId: input.versionId },
  });

  return { ok: true };
}

/** Human copy for a status chip. */
export const PACKAGE_VERSION_STATUS_LABEL: Record<PackageVersionStatus, string> = {
  DRAFT: "Draft — not live, no member is on it",
  PENDING_APPROVAL: "Awaiting a checker",
  APPROVED: "Approved — awaiting its effective date",
  ACTIVE: "Live",
  SUPERSEDED: "Superseded",
  REJECTED: "Rejected",
};

export type PackageVersionWhere = Prisma.PackageVersionWhereInput;
