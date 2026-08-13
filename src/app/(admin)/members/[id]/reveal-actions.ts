"use server";

/**
 * UAT-HF P11.05 — the only route to an unmasked member field (DEF-080, DEC-10).
 *
 * DEC-10, signed: "An explicit, permission-gated **reveal** is available. Every
 * reveal is audited with actor, member, purpose, and time. The reveal **expires
 * on navigation** and on session expiry."
 *
 * Two consequences shape this file:
 *
 *   * the full value is **fetched on demand**, never rendered and hidden. If it
 *     travelled with the page it would be in the DOM, and a mask over it is
 *     decoration rather than a control;
 *   * "expires on navigation" needs no implementation here, and that is the
 *     point: the revealed value lives only in the calling component's state, so
 *     a route change discards it. Nothing persists it, so nothing has to
 *     remember to clear it.
 */

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import {
  MIN_REVEAL_PURPOSE,
  REVEALABLE_FIELDS,
  REVEAL_FIELD_LABELS,
  SENSITIVE_REVEAL_PERMISSION,
  type RevealableField,
} from "@/lib/sensitive-detail";
import { mutationFail, mutationOk, toMutationFailure, type MutationResult } from "@/lib/mutation-contract";
import { newCorrelationId } from "@/lib/correlation";

export interface RevealedValue {
  field: RevealableField;
  value: string;
}

export async function revealMemberFieldAction(
  memberId: string,
  _previous: MutationResult<RevealedValue> | null,
  formData: FormData,
): Promise<MutationResult<RevealedValue>> {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const tenantId = session.user.tenantId;
  const correlationId = newCorrelationId();

  const field = String(formData.get("field") ?? "") as RevealableField;
  const purpose = String(formData.get("purpose") ?? "").trim();

  if (!REVEALABLE_FIELDS.includes(field)) {
    return mutationFail("VALIDATION", { correlationId, message: "That field cannot be revealed." });
  }
  if (purpose.length < MIN_REVEAL_PURPOSE) {
    // A reveal with no recorded why is not auditable, and an audit trail nobody
    // can interpret six months later is not one.
    return mutationFail("VALIDATION", {
      correlationId,
      message: "Give a reason for viewing this — it is recorded against your name.",
      fieldErrors: { purpose: ["Say why you need to see it."] },
    });
  }

  // The permission gate. Checked BEFORE the read, so an unauthorized request
  // never loads the value it is not allowed to see.
  const permissions = session.user.permissions ?? [];
  if (!permissions.includes(SENSITIVE_REVEAL_PERMISSION)) {
    return mutationFail("FORBIDDEN", {
      correlationId,
      message: "You do not have permission to view full identity details. Ask a supervisor.",
    });
  }

  try {
    const member = await prisma.member.findFirst({
      where: { id: memberId, tenantId },
      select: { idNumber: true, phone: true, email: true, memberNumber: true },
    });
    if (!member) {
      return mutationFail("VALIDATION", { correlationId, message: "That member no longer exists." });
    }

    const value = member[field];
    if (!value) {
      return mutationFail("VALIDATION", {
        correlationId,
        message: `No ${REVEAL_FIELD_LABELS[field].toLowerCase()} is recorded for this member.`,
      });
    }

    // Audited BEFORE the value is returned: if the write fails, the caller does
    // not get the value. An un-audited reveal is the thing DEC-10 forbids.
    await writeAudit({
      userId: session.user.id,
      action: "MEMBER_SENSITIVE_REVEALED",
      module: "MEMBERS",
      description: `${REVEAL_FIELD_LABELS[field]} revealed for member ${member.memberNumber}`,
      metadata: { memberId, field, purpose, correlationId },
    });

    return mutationOk<RevealedValue>(correlationId, { data: { field, value } });
  } catch (err) {
    return toMutationFailure(err, { operation: "members.reveal", correlationId });
  }
}

export interface HouseholdMember {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  relationship: string;
  status: string;
  dateOfBirth: Date;
}

/**
 * UAT-HF P11.05 — load the household, on request.
 *
 * DEF-080's landing view rendered the whole family unit "with no interaction at
 * all", including a minor's full name and member number. The names are not in
 * the page payload any more; this is how they are asked for.
 *
 * Deliberately NOT permission-gated beyond the existing MEMBER_OPS role, and
 * deliberately NOT audited. DEC-10 gates and audits a *reveal of a sensitive
 * field*; household composition is listed there as "collapsed", not as
 * restricted. Auditing every expansion would bury the reveals that matter in
 * noise, and gating it would stop an officer doing their job.
 *
 * What it fixes is the DEFAULT exposure — a screen at a counter no longer
 * displays a household to whoever is next in the queue.
 */
export async function loadHouseholdAction(
  memberId: string,
): Promise<MutationResult<{ principal: HouseholdMember; dependants: HouseholdMember[] }>> {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const correlationId = newCorrelationId();

  try {
    const member = await prisma.member.findFirst({
      where: { id: memberId, tenantId: session.user.tenantId },
      select: {
        id: true, memberNumber: true, firstName: true, lastName: true,
        relationship: true, status: true, dateOfBirth: true,
        dependents: {
          select: {
            id: true, memberNumber: true, firstName: true, lastName: true,
            relationship: true, status: true, dateOfBirth: true,
          },
          orderBy: { dateOfBirth: "asc" },
        },
      },
    });
    if (!member) {
      return mutationFail("VALIDATION", { correlationId, message: "That member no longer exists." });
    }

    const { dependents, ...principal } = member;
    return mutationOk(correlationId, { data: { principal, dependants: dependents } });
  } catch (err) {
    return toMutationFailure(err, { operation: "members.household", correlationId });
  }
}
