"use server";

/**
 * UAT-HF P09.01 — the governed half of a package change (DEF-024).
 *
 * `updatePackageAction` now leaves a DRAFT and touches nothing live. These are
 * the three steps that get it live, and the middle one is the whole point:
 * **a different person has to say yes.**
 *
 * DEC-03: "Every coverage-affecting edit creates a draft version. A different
 * authorized checker approves it. Activation is effective-dated ... The maker
 * may not be the checker."
 */

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import {
  PACKAGE_ACTIVATION_ACTION,
  activateApprovedVersion,
  canTransition,
  mayApprove,
  type PackageVersionStatus,
} from "@/server/services/package-change-control.service";
import { mutationFail, mutationOk, toMutationFailure, type MutationResult } from "@/lib/mutation-contract";
import { newCorrelationId } from "@/lib/correlation";

export interface VersionMoved {
  versionId: string;
  status: PackageVersionStatus;
}

async function loadVersion(tenantId: string, packageId: string, versionId: string) {
  return prisma.packageVersion.findFirst({
    where: { id: versionId, packageId, package: { tenantId } },
    select: {
      id: true,
      versionNumber: true,
      status: true,
      submittedById: true,
      effectiveFrom: true,
      package: { select: { id: true, name: true } },
    },
  });
}

/** Maker: hand a draft to a checker. */
export async function submitPackageVersionAction(
  packageId: string,
  _previous: MutationResult<VersionMoved> | null,
  formData: FormData,
): Promise<MutationResult<VersionMoved>> {
  const session = await requireRole(ROLES.UNDERWRITING);
  const correlationId = newCorrelationId();
  const versionId = String(formData.get("versionId") ?? "");

  try {
    const version = await loadVersion(session.user.tenantId, packageId, versionId);
    if (!version) return mutationFail("VALIDATION", { correlationId, message: "That version no longer exists." });

    const move = canTransition(version.status as PackageVersionStatus, "PENDING_APPROVAL");
    if (!move.ok) return mutationFail("CONFLICT", { correlationId, message: move.reason });

    await prisma.packageVersion.updateMany({
      where: { id: versionId, status: version.status },
      data: { status: "PENDING_APPROVAL", submittedById: session.user.id, submittedAt: new Date() },
    });

    await writeAudit({
      userId: session.user.id,
      action: "PACKAGE_VERSION_SUBMITTED",
      module: "PACKAGES",
      description: `Package "${version.package.name}" v${version.versionNumber} submitted for approval`,
      metadata: { packageId, versionId, correlationId },
    });

    revalidatePath(`/packages/${packageId}/edit`);
    return mutationOk<VersionMoved>(correlationId, {
      nextAction: "Awaiting a checker",
      data: { versionId, status: "PENDING_APPROVAL" },
    });
  } catch (err) {
    return toMutationFailure(err, { operation: "packages.submitVersion", correlationId });
  }
}

/**
 * Checker: approve, and activate if the effective date has arrived.
 *
 * The maker ≠ checker rule is enforced here rather than only by the approval
 * matrix, because the matrix returns silently when no rule is configured — and
 * "no rule configured" must not mean "anyone may self-approve". The run found
 * exactly that shape: an engine that worked, on an object nobody had routed
 * into it.
 */
export async function approvePackageVersionAction(
  packageId: string,
  _previous: MutationResult<VersionMoved> | null,
  formData: FormData,
): Promise<MutationResult<VersionMoved>> {
  const session = await requireRole(ROLES.UNDERWRITING);
  const correlationId = newCorrelationId();
  const versionId = String(formData.get("versionId") ?? "");

  try {
    const version = await loadVersion(session.user.tenantId, packageId, versionId);
    if (!version) return mutationFail("VALIDATION", { correlationId, message: "That version no longer exists." });

    const move = canTransition(version.status as PackageVersionStatus, "APPROVED");
    if (!move.ok) return mutationFail("CONFLICT", { correlationId, message: move.reason });

    const separation = mayApprove(version.submittedById, session.user.id);
    if (!separation.ok) {
      return mutationFail("FORBIDDEN", { correlationId, message: separation.reason });
    }

    // Conditional on the status we read, so two checkers cannot both approve.
    const claimed = await prisma.packageVersion.updateMany({
      where: { id: versionId, status: "PENDING_APPROVAL" },
      data: { status: "APPROVED", approvedById: session.user.id, approvedAt: new Date() },
    });
    if (claimed.count !== 1) {
      return mutationFail("CONFLICT", {
        correlationId,
        message: "That version was actioned by someone else. Reload and check.",
      });
    }

    await writeAudit({
      userId: session.user.id,
      action: "PACKAGE_VERSION_APPROVED",
      module: "PACKAGES",
      description: `Package "${version.package.name}" v${version.versionNumber} approved`,
      metadata: { packageId, versionId, makerId: version.submittedById ?? "", correlationId },
    });

    // Effective-dated: activate now only if the date has arrived. A future
    // effective date leaves it APPROVED for a scheduled activation.
    const activation = await prisma.$transaction((tx) =>
      activateApprovedVersion(tx, { packageId, versionId }),
    );

    if (activation.ok) {
      await writeAudit({
        userId: session.user.id,
        action: "PACKAGE_VERSION_ACTIVATED",
        module: "PACKAGES",
        description: `Package "${version.package.name}" v${version.versionNumber} is now live`,
        metadata: { packageId, versionId, actionType: PACKAGE_ACTIVATION_ACTION, correlationId },
      });
    }

    revalidatePath(`/packages/${packageId}/edit`);
    revalidatePath(`/packages/${packageId}`);
    return mutationOk<VersionMoved>(correlationId, {
      entityRef: `v${version.versionNumber}`,
      nextAction: activation.ok ? "View package" : "Awaiting its effective date",
      data: { versionId, status: activation.ok ? "ACTIVE" : "APPROVED" },
    });
  } catch (err) {
    return toMutationFailure(err, { operation: "packages.approveVersion", correlationId });
  }
}

/** Checker: refuse, with a reason. */
export async function rejectPackageVersionAction(
  packageId: string,
  _previous: MutationResult<VersionMoved> | null,
  formData: FormData,
): Promise<MutationResult<VersionMoved>> {
  const session = await requireRole(ROLES.UNDERWRITING);
  const correlationId = newCorrelationId();
  const versionId = String(formData.get("versionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (reason.length < 5) {
    return mutationFail("VALIDATION", {
      correlationId,
      message: "Say why you are rejecting this — the maker needs to know what to change.",
      fieldErrors: { reason: ["Enter a reason."] },
    });
  }

  try {
    const version = await loadVersion(session.user.tenantId, packageId, versionId);
    if (!version) return mutationFail("VALIDATION", { correlationId, message: "That version no longer exists." });

    const move = canTransition(version.status as PackageVersionStatus, "REJECTED");
    if (!move.ok) return mutationFail("CONFLICT", { correlationId, message: move.reason });

    const separation = mayApprove(version.submittedById, session.user.id);
    if (!separation.ok) {
      return mutationFail("FORBIDDEN", { correlationId, message: separation.reason });
    }

    await prisma.packageVersion.updateMany({
      where: { id: versionId, status: version.status },
      data: { status: "REJECTED", rejectionReason: reason },
    });

    await writeAudit({
      userId: session.user.id,
      action: "PACKAGE_VERSION_REJECTED",
      module: "PACKAGES",
      description: `Package "${version.package.name}" v${version.versionNumber} rejected: ${reason}`,
      metadata: { packageId, versionId, reason, correlationId },
    });

    revalidatePath(`/packages/${packageId}/edit`);
    return mutationOk<VersionMoved>(correlationId, { data: { versionId, status: "REJECTED" } });
  } catch (err) {
    return toMutationFailure(err, { operation: "packages.rejectVersion", correlationId });
  }
}
