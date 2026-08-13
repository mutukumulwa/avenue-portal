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
import { StaleMemberTransitionError, MembersService } from "@/server/services/members.service";
import { writeAudit } from "@/lib/audit";
import { memberTransitionAuditAction } from "@/lib/member-status";
import { evaluateTransition, type MemberStatusValue } from "@/lib/member-lifecycle-policy";
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
import { resolveMemberEnrolmentDates } from "@/lib/member-enrolment";
import {
  MEMBER_ADDRESS_FIELDS,
  validateMemberAddress,
} from "@/lib/member-address";
import { validateMemberDemographics } from "@/lib/member-demographics";

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
  ...MEMBER_ADDRESS_FIELDS,
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
  addressCountry: string | null;
  addressDistrict: string | null;
  addressLocality: string | null;
  addressSubcounty: string | null;
  addressParish: string | null;
  addressVillage: string | null;
  addressLine: string | null;
  addressLatitude: { toString(): string } | null;
  addressLongitude: { toString(): string } | null;
  addressCoordinateConsentAt: Date | null;
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
    addressCountry: member.addressCountry ?? "Uganda",
    addressDistrict: member.addressDistrict ?? "",
    addressLocality: member.addressLocality ?? "",
    addressSubcounty: member.addressSubcounty ?? "",
    addressParish: member.addressParish ?? "",
    addressVillage: member.addressVillage ?? "",
    addressLine: member.addressLine ?? "",
    addressLatitude: member.addressLatitude?.toString() ?? "",
    addressLongitude: member.addressLongitude?.toString() ?? "",
    addressCoordinateConsent:
      member.addressLatitude && member.addressLongitude && member.addressCoordinateConsentAt ? "on" : "",
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
        addressCountry: true,
        addressDistrict: true,
        addressLocality: true,
        addressSubcounty: true,
        addressParish: true,
        addressVillage: true,
        addressLine: true,
        addressLatitude: true,
        addressLongitude: true,
        addressCoordinateConsentAt: true,
        updatedAt: true,
      },
    });
    if (!current) {
      return mutationFail("VALIDATION", { correlationId, message: "That member no longer exists." });
    }

    const fieldErrors: Record<string, string[]> = {};
    const demographics = validateMemberDemographics(submitted);
    if (!demographics.ok) Object.assign(fieldErrors, demographics.fieldErrors);
    const dates = resolveMemberEnrolmentDates({
      dateOfBirth: submitted.dateOfBirth,
      relationship: submitted.relationship,
    });
    if (!dates.ok) {
      // The edit form has no effective-date field; only DOB is relevant here.
      if (dates.fieldErrors.dateOfBirth) fieldErrors.dateOfBirth = dates.fieldErrors.dateOfBirth;
    }
    const address = validateMemberAddress(submitted);
    if (!address.ok) Object.assign(fieldErrors, address.fieldErrors);
    if (Object.keys(fieldErrors).length > 0 || !address.ok || !demographics.ok || !dates.ok) {
      return mutationFail("VALIDATION", {
        correlationId,
        message: "Correct the highlighted member details. Nothing was saved.",
        fieldErrors,
      });
    }

    Object.assign(submitted, {
      firstName: demographics.value.firstName,
      lastName: demographics.value.lastName,
      gender: demographics.value.gender,
      relationship: demographics.value.relationship,
      phone: demographics.value.phone ?? "",
      email: demographics.value.email ?? "",
      dateOfBirth: dates.value.dateOfBirth,
    });

    // Only what THIS operator actually changed. Writing the whole record from a
    // stale copy is the half of DEF-077 that a precondition alone cannot fix.
    const edits = changedFields(original, submitted);
    if (MEMBER_ADDRESS_FIELDS.some((field) => field in edits)) {
      // The address validator reasons about the complete hierarchy and the
      // coordinate pair. Send the complete canonical block when any part moves;
      // the optimistic precondition still prevents overwriting a newer copy.
      Object.assign(edits, {
        addressCountry: address.value.addressCountry,
        addressDistrict: address.value.addressDistrict ?? "",
        addressLocality: address.value.addressLocality ?? "",
        addressSubcounty: address.value.addressSubcounty ?? "",
        addressParish: address.value.addressParish ?? "",
        addressVillage: address.value.addressVillage ?? "",
        addressLine: address.value.addressLine ?? "",
        addressLatitude: address.value.addressLatitude ?? "",
        addressLongitude: address.value.addressLongitude ?? "",
        addressCoordinateConsent: address.value.hasCoordinateConsent ? "on" : "",
      });
    }
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
  // UAT-HF P07.02: the fields the P07.01 command specifies. This action has no
  // UI caller yet (P07.03 builds the confirmation surface), so enforcing the
  // full policy now costs nothing and means that surface gets built against the
  // real contract rather than against a laxer one it would then have to tighten.
  const lastCoveredDay = String(formData.get("lastCoveredDay") ?? "").trim();
  const checkerId = String(formData.get("checkerId") ?? "").trim();

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
      select: { status: true, version: true, firstName: true, lastName: true },
    });
    if (!member) {
      return mutationFail("VALIDATION", { correlationId, message: "That member no longer exists." });
    }
    if (member.status === nextStatus) {
      return mutationOk(memberId, { data: { from: member.status, to: nextStatus } });
    }

    // UAT-HF P07.02 — the P07.01 policy table decides, not `canEditTransition`.
    //
    // `canEditTransition` models what the EDIT DROPDOWN may do. It cannot say
    // who may act, whether a checker is required, or that a cover-ending change
    // needs a last covered day — the three questions that let each screen grow
    // its own ruleset, which is the shape behind all eight P07.01 defects.
    const decision = evaluateTransition(
      {
        memberId,
        fromStatus: member.status as MemberStatusValue,
        fromVersion: member.version,
        toStatus: nextStatus as MemberStatusValue,
        reasonNote: reason,
        lastCoveredDay: lastCoveredDay || undefined,
        requestedAt: new Date(),
        makerId: session.user.id,
        // An absent role can match no policy entry, so it refuses rather than
        // falling through to a permissive default.
        makerRole: session.user.role ?? "",
        checkerId: checkerId || undefined,
        idempotencyKey: correlationId,
      },
      {
        // This action IS the governed command — it is not the profile form.
        channel: "GOVERNED_FLOW",
        currentStatus: member.status as MemberStatusValue,
        currentVersion: member.version,
      },
    );

    if (!decision.allowed) {
      // Staleness is a CONFLICT the operator can resolve by reloading;
      // everything else is a refusal of the request as made.
      return mutationFail(decision.refusal === "STALE" ? "CONFLICT" : "FORBIDDEN", {
        correlationId,
        message: decision.message,
      });
    }

    // UAT-HF P07.02: the transition is now one transaction with a conditional
    // update. A lost race raises StaleMemberTransitionError rather than
    // silently overwriting somebody else's change.
    try {
      await MembersService.changeStatus(tenantId, memberId, nextStatus, {
        // DEC-12: the operator's date is the last covered day, and the coverage
        // period must close on it rather than on the click.
        effectiveAt: lastCoveredDay ? new Date(`${lastCoveredDay}T00:00:00Z`) : undefined,
        expectedVersion: member.version,
        // P07.02: the trail is written INSIDE the transaction. The writeAudit
        // below still runs and is still useful, but it happens after the commit
        // — so on its own it loses the record of a change that did happen.
        event: {
          actor: { id: session.user.id, role: session.user.role ?? undefined },
          reasonNote: reason,
          correlationId,
        },
      });
    } catch (err) {
      if (err instanceof StaleMemberTransitionError) {
        return mutationFail("CONFLICT", { correlationId, message: err.message });
      }
      throw err;
    }

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
