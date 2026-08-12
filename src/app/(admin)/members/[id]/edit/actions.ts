"use server";

/**
 * UAT-HF P05.05 — member profile editing, separated from member lifecycle.
 *
 * DEF-077 (S2): "Staff B, still holding the copy loaded before A saved, changed
 * a different field and saved. B's save SUCCEEDED with no conflict banner ...
 * A's committed change was gone. B's whole-form submit wrote every field from
 * its stale copy, so a field neither operator intended to touch was reverted."
 *
 * DEF-041 / DEF-043: lifecycle status was an ordinary dropdown on the ordinary
 * edit form, so suspending a member was indistinguishable — in ceremony, in
 * audit weight, and in what the server accepted — from correcting a spelling.
 *
 * ## Two actions, on purpose
 *
 * `updateMemberProfileAction` accepts demographics ONLY. It does not read
 * `status` from the form at all, so the acceptance's "cannot suspend/lapse/
 * reinstate even with forged form data" holds by construction rather than by a
 * validation branch someone can forget.
 *
 * `changeMemberStatusAction` is a separate, deliberate command that requires a
 * reason. The plan routes lifecycle through P07, which is not built yet;
 * deleting the control before its replacement exists would remove the only way
 * to suspend a member, since `lifecycleService` has governed flows for lapse,
 * reinstate, cancel and terminate but **not** for suspend. So this is a bridge:
 * it is narrow, reasoned and audited, and P07.01 replaces it with the full
 * policy table.
 */

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { MembersService } from "@/server/services/members.service";
import { writeAudit } from "@/lib/audit";
import { memberTransitionAuditAction, canEditTransition } from "@/lib/member-status";
import {
  mutationConflict,
  mutationFail,
  mutationOk,
  toMutationFailure,
  type MutationResult,
} from "@/lib/mutation-contract";
import { newCorrelationId } from "@/lib/correlation";
import { changedFields, describeConflict, readExpectedState } from "@/lib/concurrency";
import { DuplicateIdentityError } from "@/server/services/identity-match.service";
import type { MemberStatus, MemberRelationship, Gender } from "@prisma/client";

/**
 * The only fields a profile edit may touch. `status` is deliberately absent —
 * this list is what the action iterates, so a forged `status` in the POST body
 * has nothing to bind to.
 */
const PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "otherNames",
  "idNumber",
  "dateOfBirth",
  "gender",
  "phone",
  "email",
  "relationship",
] as const;

type ProfileField = (typeof PROFILE_FIELDS)[number];
type ProfileValues = Record<ProfileField, string>;

/** Hidden fields carrying the copy the browser loaded, for the three-way diff. */
const ORIGINAL_PREFIX = "__original_";

function readValues(formData: FormData, prefix = ""): ProfileValues {
  const out = {} as ProfileValues;
  for (const field of PROFILE_FIELDS) {
    out[field] = String(formData.get(`${prefix}${field}`) ?? "").trim();
  }
  return out;
}

function toComparable(member: {
  firstName: string;
  lastName: string;
  otherNames: string | null;
  idNumber: string | null;
  dateOfBirth: Date;
  gender: string;
  phone: string | null;
  email: string | null;
  relationship: string;
}): ProfileValues {
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    otherNames: member.otherNames ?? "",
    idNumber: member.idNumber ?? "",
    dateOfBirth: member.dateOfBirth.toISOString().slice(0, 10),
    gender: member.gender,
    phone: member.phone ?? "",
    email: member.email ?? "",
    relationship: member.relationship,
  };
}

export interface ProfileUpdated {
  memberId: string;
  changed: string[];
}

export async function updateMemberProfileAction(
  memberId: string,
  _previous: MutationResult<ProfileUpdated> | null,
  formData: FormData,
): Promise<MutationResult<ProfileUpdated>> {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const tenantId = session.user.tenantId;
  const correlationId = newCorrelationId();

  const expected = readExpectedState(formData);
  if (!expected) {
    // A form that cannot say what it expected to find cannot be saved safely —
    // that is precisely the state DEF-077's form was in.
    return mutationFail("VALIDATION", {
      correlationId,
      message: "This form could not be saved safely. Reload the member and try again.",
    });
  }

  const submitted = readValues(formData);
  const original = readValues(formData, ORIGINAL_PREFIX);

  try {
    const current = await prisma.member.findFirst({
      where: { id: memberId, tenantId },
      select: {
        firstName: true,
        lastName: true,
        otherNames: true,
        idNumber: true,
        dateOfBirth: true,
        gender: true,
        phone: true,
        email: true,
        relationship: true,
        updatedAt: true,
      },
    });
    if (!current) {
      return mutationFail("VALIDATION", { correlationId, message: "That member no longer exists." });
    }

    // Only what THIS operator actually changed. Writing the whole record from a
    // stale copy is the half of DEF-077 that a precondition alone cannot fix.
    const edits = changedFields(original, submitted);
    if (Object.keys(edits).length === 0) {
      return mutationOk<ProfileUpdated>(memberId, {
        nextAction: "Back to member",
        data: { memberId, changed: [] },
      });
    }

    const outcome = await MembersService.updateProfile(tenantId, memberId, edits, expected);

    if (outcome === "STALE") {
      // Nothing was written. Hand back the comparison so their work survives
      // the rejection — the acceptance requires both values to be preserved.
      return mutationConflict(
        describeConflict({
          entity: "member",
          original,
          submitted,
          current: toComparable(current),
          currentUpdatedAt: current.updatedAt,
          fields: PROFILE_FIELDS,
        }),
        { correlationId, operationId: memberId },
      );
    }

    await writeAudit({
      userId: session.user.id,
      action: "MEMBER_UPDATED",
      module: "MEMBERS",
      description: `Member profile updated: ${submitted.firstName} ${submitted.lastName}`,
      metadata: { memberId, changed: Object.keys(edits).join(", "), correlationId },
    });

    return mutationOk<ProfileUpdated>(memberId, {
      nextAction: "Back to member",
      data: { memberId, changed: Object.keys(edits) },
    });
  } catch (err) {
    if (err instanceof DuplicateIdentityError) {
      // P05.04: a hard identity conflict, worded so it names nobody.
      return mutationFail("CONFLICT", { correlationId, message: err.message });
    }
    return toMutationFailure(err, { operation: "members.updateProfile", correlationId });
  }
}

/**
 * Change a member's lifecycle status — a separate command with its own reason.
 *
 * Bridge for P07.01. It is intentionally *not* reachable from the profile form's
 * submit: a status change is a different decision from a spelling correction,
 * and the run found them sharing one control and one audit weight.
 */
export async function changeMemberStatusAction(
  memberId: string,
  _previous: MutationResult<{ from: string; to: string }> | null,
  formData: FormData,
): Promise<MutationResult<{ from: string; to: string }>> {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const tenantId = session.user.tenantId;
  const correlationId = newCorrelationId();

  const nextStatus = String(formData.get("status") ?? "").trim() as MemberStatus;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!nextStatus) {
    return mutationFail("VALIDATION", { correlationId, message: "Choose the new status." });
  }
  if (reason.length < 5) {
    // A lifecycle change without a recorded why is what makes an audit trail
    // unusable six months later.
    return mutationFail("VALIDATION", {
      correlationId,
      message: "Give a reason for this status change — it is recorded in the audit trail.",
      fieldErrors: { reason: ["Enter at least a short reason."] },
    });
  }

  try {
    const member = await prisma.member.findFirst({
      where: { id: memberId, tenantId },
      select: { status: true, firstName: true, lastName: true },
    });
    if (!member) {
      return mutationFail("VALIDATION", { correlationId, message: "That member no longer exists." });
    }
    if (member.status === nextStatus) {
      return mutationOk(memberId, { data: { from: member.status, to: nextStatus } });
    }
    if (!canEditTransition(member.status, nextStatus)) {
      return mutationFail("FORBIDDEN", {
        correlationId,
        message: `${member.status} is a governed lifecycle state. Use the dedicated reinstatement or termination flow instead of a status change.`,
      });
    }

    await MembersService.changeStatus(tenantId, memberId, nextStatus);

    await writeAudit({
      userId: session.user.id,
      action: memberTransitionAuditAction(member.status, nextStatus),
      module: "MEMBERS",
      description: `Member ${member.firstName} ${member.lastName}: status ${member.status} → ${nextStatus}`,
      metadata: { memberId, previousStatus: member.status, newStatus: nextStatus, reason, correlationId },
    });

    return mutationOk(memberId, {
      nextAction: "Back to member",
      data: { from: member.status, to: nextStatus },
    });
  } catch (err) {
    return toMutationFailure(err, { operation: "members.changeStatus", correlationId });
  }
}

export type { MemberRelationship, Gender };
