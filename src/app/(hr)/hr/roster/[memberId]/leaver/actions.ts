"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createWithDocumentNumber } from "@/lib/document-number";
import { validateEvidence } from "@/lib/endorsement-evidence";
import { calendarDateToUtcDate, calendarDateFromInstant, formatCalendarDate } from "@/lib/calendar-date";
import { writeAudit } from "@/lib/audit";

/**
 * UAT-HF P08.01 — the HR leaver request (DEF-004).
 *
 * "No termination, leaver, removal, exit or end-of-cover control exists anywhere
 * in the HR portal. Roster > 'Add Member' and Endorsement Requests > '+ New
 * Endorsement' both navigate to /hr/roster/new, which is a 'Member Addition'
 * form only. The member detail page /hr/roster/<id> exposes only 'View All
 * Endorsements' and no lifecycle action. The Endorsement Requests list offers a
 * 'Member Deletion' type FILTER, advertising a capability with no creation path
 * behind it."
 *
 * The business consequence the register names: "terminated staff continue to
 * appear ACTIVE on the employer roster and remain eligible, so claims can be
 * incurred against a leaver until someone intervenes outside the HR portal."
 *
 * ## What this does and does NOT do
 *
 * It raises a governed `MEMBER_DELETION` endorsement and **changes no cover**.
 * That is deliberate and is the plan's acceptance criterion: "no cover changes
 * before approval". HR reports the leaver; the TPA's checker approves; only the
 * approval moves eligibility. An employer who could end cover directly could end
 * it wrongly, and a member would discover it at a counter.
 *
 * ## The last covered day is inclusive
 *
 * Controlled source CT-034: "the member remains eligible through the approved
 * final day inclusive". The date HR enters is the last day cover applies, not
 * the first day it does not — those are off by one and the difference is a day
 * of claims. The form reads the date back in words for exactly this reason.
 */

export type LeaverResult =
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | undefined;

/** How far back a leaver may be reported without an out-of-band override. */
const MAX_BACKDATE_DAYS = 90;

export async function submitLeaverRequestAction(formData: FormData): Promise<LeaverResult> {
  const session = await requireRole(ROLES.HR);
  const tenantId = session.user.tenantId;
  const groupId = session.user.groupId;

  // Same N3/PRIVACY-S1-B guard as the detail page: an ungrouped HR user (or a
  // SUPER_ADMIN, which is inside ROLES.HR) must not fall through to a query that
  // drops the groupId key and reaches every group in the tenant.
  if (!groupId) {
    return { ok: false, error: "Your account is not linked to a corporate group, so it cannot report a leaver." };
  }

  const text = (k: string) => ((formData.get(k) as string | null) ?? "").trim();
  const memberId = text("memberId");
  const lastDay = text("lastDay");
  const reason = text("reason");
  const sourceReference = text("sourceReference");

  const fieldErrors: Record<string, string[]> = {};

  // The member must be in THIS HR user's own group. Resolved before anything
  // else so a tampered memberId cannot reach another employer's staff.
  const member = await prisma.member.findFirst({
    where: { id: memberId, tenantId, groupId },
    select: {
      id: true,
      memberNumber: true,
      firstName: true,
      lastName: true,
      status: true,
      relationship: true,
      coverStartDate: true,
      dependents: { where: { status: "ACTIVE" }, select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!member) {
    return { ok: false, error: "That member is not on your roster." };
  }

  if (member.status !== "ACTIVE") {
    return {
      ok: false,
      error: `${member.firstName} ${member.lastName} is already ${member.status.toLowerCase()}. There is nothing to end.`,
    };
  }

  // An open leaver request already in flight is the commonest double-submit, and
  // two of them would produce two pro-rata credits for one departure.
  const existing = await prisma.endorsement.findFirst({
    where: {
      tenantId,
      groupId,
      type: "MEMBER_DELETION",
      status: { in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"] },
      changeDetails: { path: ["memberId"], equals: memberId },
    },
    select: { endorsementNumber: true, status: true },
  });
  if (existing) {
    return {
      ok: false,
      error: `A leaver request for this member is already ${existing.status.replace(/_/g, " ").toLowerCase()} (${existing.endorsementNumber}). Withdraw that one before raising another.`,
    };
  }

  // ── Last covered day ───────────────────────────────────────────────────────
  if (!lastDay) {
    fieldErrors.lastDay = ["Enter the last day this employee is covered."];
  } else {
    const parsed = calendarDateToUtcDate(lastDay);
    if (!parsed) {
      fieldErrors.lastDay = ["Enter the last covered day as a real date."];
    } else {
      const today = calendarDateFromInstant(new Date());
      if (member.coverStartDate) {
        const start = calendarDateFromInstant(member.coverStartDate);
        if (start && lastDay < start) {
          fieldErrors.lastDay = [
            `Cover started on ${formatCalendarDate(start)}. The last covered day cannot be before it.`,
          ];
        }
      }
      if (!fieldErrors.lastDay && today) {
        const days = Math.round(
          (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${lastDay}T00:00:00Z`).getTime()) / 86_400_000,
        );
        if (days > MAX_BACKDATE_DAYS) {
          fieldErrors.lastDay = [
            `That is ${days} days ago. A leaver more than ${MAX_BACKDATE_DAYS} days back needs the TPA to apply a back-dated override — raise a support request instead.`,
          ];
        }
      }
    }
  }

  if (!reason) {
    fieldErrors.reason = ["Say why this employee is leaving."];
  } else if (reason.length > 300) {
    fieldErrors.reason = ["Use 300 characters or fewer."];
  }

  // E-015 (DEF-046): MEMBER_DELETION is a material change. Capturing the
  // reference here is what stops this request becoming one of the endorsements
  // that can be raised but never approved.
  const evidence = validateEvidence({ type: "MEMBER_DELETION", sourceReference });
  if (!evidence.ok) {
    fieldErrors.sourceReference = [evidence.message];
  }

  // Every field is validated before any is reported, so the operator fixes one
  // form rather than discovering the problems one submit at a time.
  if (!evidence.ok || Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Correct the highlighted details. Nothing has been submitted.", fieldErrors };
  }

  // P08.04: the retrying allocator, not read-then-write. Two HR managers
  // reporting leavers at the same moment computed the same max+1; the loser saw
  // a raw P2002 on [tenantId, endorsementNumber].
  const created = await createWithDocumentNumber(
    "END",
    (yp) =>
      prisma.endorsement
        .findFirst({
          where: { tenantId, endorsementNumber: { startsWith: yp } },
          orderBy: { endorsementNumber: "desc" },
          select: { endorsementNumber: true },
        })
        .then((r) => r?.endorsementNumber ?? null),
    (endorsementNumber) => prisma.endorsement.create({
    data: {
      tenantId,
      groupId,
      endorsementNumber,
      type: "MEMBER_DELETION",
      status: "SUBMITTED",
      // The endorsement's effective date IS the last covered day. The approval
      // path reads `lastDay` and closes cover inclusively (CT-034); storing the
      // same calendar date in both keeps them from drifting apart.
      effectiveDate: calendarDateToUtcDate(lastDay)!,
      requestedBy: session.user.id,
      changeDetails: {
        memberId: member.id,
        memberNumber: member.memberNumber,
        memberName: `${member.firstName} ${member.lastName}`,
        lastDay,
        reason,
        sourceReference: evidence.value,
        // Recorded so the checker sees the true scope: ending a principal ends
        // their dependants' cover too, and the run's own DEF-031 work showed how
        // easily a household is forgotten.
        dependantsAffected: member.dependents.length,
        raisedVia: "HR_PORTAL",
      } as never,
      // Pro-rata is the TPA's calculation, not the employer's. Left at zero for
      // the checker's compute step rather than guessed here.
      proratedAmount: 0,
    },
    select: { id: true, endorsementNumber: true },
    }),
  );

  await writeAudit({
    userId: session.user.id,
    action: "HR_LEAVER_REQUESTED",
    module: "ENDORSEMENTS",
    description: `HR reported ${member.firstName} ${member.lastName} (${member.memberNumber}) leaving, last covered day ${lastDay}`,
    metadata: {
      endorsementId: created.id,
      endorsementNumber: created.endorsementNumber,
      memberId: member.id,
      groupId,
      lastDay,
      dependantsAffected: member.dependents.length,
    },
  });

  revalidatePath("/hr/roster");
  revalidatePath(`/hr/roster/${member.id}`);
  revalidatePath("/hr/endorsements");
  redirect(`/hr/endorsements/${created.id}?raised=1`);
}

/**
 * Withdraw a leaver request that has not been decided yet.
 *
 * P08.01 asks for "cancel/withdraw before approval". Without it, an HR manager
 * who reports the wrong person — or reports a resignation that is then retracted
 * — has to ask the TPA to reject their own request, which reads in the audit
 * trail as the TPA refusing the employer rather than the employer correcting
 * themselves.
 */
export async function withdrawLeaverRequestAction(formData: FormData): Promise<LeaverResult> {
  const session = await requireRole(ROLES.HR);
  const tenantId = session.user.tenantId;
  const groupId = session.user.groupId;
  if (!groupId) return { ok: false, error: "Your account is not linked to a corporate group." };

  const endorsementId = ((formData.get("endorsementId") as string | null) ?? "").trim();
  const reason = ((formData.get("reason") as string | null) ?? "").trim();

  if (!reason) {
    return { ok: false, error: "Say why you are withdrawing this request.", fieldErrors: { reason: ["Required."] } };
  }

  // Conditional update: the request must still be undecided AND belong to this
  // employer. A checker approving at the same moment wins, and this reports that
  // plainly rather than silently doing nothing.
  const claimed = await prisma.endorsement.updateMany({
    where: {
      id: endorsementId,
      tenantId,
      groupId,
      requestedBy: session.user.id,
      status: { in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW"] },
    },
    data: { status: "CANCELLED", rejectionReason: `Withdrawn by employer: ${reason}` },
  });

  if (claimed.count !== 1) {
    return {
      ok: false,
      error:
        "This request can no longer be withdrawn — it has already been actioned, or it was not raised from your account.",
    };
  }

  await writeAudit({
    userId: session.user.id,
    action: "HR_LEAVER_WITHDRAWN",
    module: "ENDORSEMENTS",
    description: `HR withdrew leaver request ${endorsementId}: ${reason}`,
    metadata: { endorsementId, groupId, reason },
  });

  revalidatePath("/hr/endorsements");
  revalidatePath(`/hr/endorsements/${endorsementId}`);
  return undefined;
}
