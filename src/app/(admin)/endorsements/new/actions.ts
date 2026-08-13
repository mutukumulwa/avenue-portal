"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createWithDocumentNumber } from "@/lib/document-number";
import {
  MemberActionGuardService,
  memberActionRefusal,
} from "@/server/services/member-action-guard.service";
import { validateEvidence } from "@/lib/endorsement-evidence";

export type EndorsementSubmitResult = { ok: false; error: string } | undefined;

const ENDORSEMENT_TYPES = new Set([
  "MEMBER_ADDITION",
  "MEMBER_DELETION",
  "DEPENDENT_ADDITION",
  "DEPENDENT_DELETION",
  "PACKAGE_UPGRADE",
  "PACKAGE_DOWNGRADE",
  "BENEFIT_MODIFICATION",
  "GROUP_DATA_CHANGE",
  "SALARY_CHANGE",
  "CORRECTION",
]);
const MEMBER_SCOPED_TYPES = new Set([
  "MEMBER_DELETION", "DEPENDENT_ADDITION", "DEPENDENT_DELETION", "SALARY_CHANGE",
]);

export async function submitEndorsementAction(formData: FormData): Promise<EndorsementSubmitResult> {
  const session = await requireRole(ROLES.MEMBER_OPS);

  const tenantId = session.user.tenantId;
  const groupId       = formData.get("groupId") as string;
  const type          = formData.get("type") as string;
  const effectiveDate = formData.get("effectiveDate") as string;

  if (!groupId || !type || !effectiveDate) throw new Error("Missing required fields");
  if (!ENDORSEMENT_TYPES.has(type)) {
    return { ok: false, error: "Select a valid endorsement type." };
  }

  // `groupId` is untrusted form data. Resolve it inside both the tenant and an
  // optional client confinement before reading a member or creating anything.
  // This one lookup also supplies the financial preview calculation below.
  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      tenantId,
      ...(session.user.clientId ? { clientId: session.user.clientId } : {}),
    },
    select: { renewalDate: true, contributionRate: true },
  });
  if (!group) {
    return { ok: false, error: "The selected group is unavailable. Return to endorsements and choose a group in your organisation." };
  }

  // Build changeDetails based on type
  const get = (k: string) => (formData.get(k) as string | null) ?? "";

  const memberId = get("memberId").trim();
  if (MEMBER_SCOPED_TYPES.has(type) && !memberId) {
    return { ok: false, error: "Select the member this endorsement applies to." };
  }
  // A correction may be group-level. When it names a member, it is still a
  // member action and must obey the current status policy.
  if (memberId) {
    const verdict = await MemberActionGuardService.evaluate({
      tenantId,
      memberId,
      groupId,
      action: "ENDORSEMENT",
    });
    if (!verdict.allowed) return { ok: false, error: memberActionRefusal(verdict) };
  }

  const changeDetails: Record<string, string> = {};

  switch (type) {
    case "MEMBER_ADDITION":
      Object.assign(changeDetails, {
        firstName: get("firstName"), lastName: get("lastName"),
        dateOfBirth: get("dateOfBirth"), gender: get("gender"),
        idNumber: get("idNumber"), relationship: get("relationship"),
        phone: get("phone"), email: get("email"),
      });
      break;
    case "MEMBER_DELETION":
      Object.assign(changeDetails, {
        memberId: get("memberId"), reason: get("reason"),
        lastDay: get("lastDay"), refundEligible: get("refundEligible"),
      });
      break;
    case "DEPENDENT_ADDITION":
      Object.assign(changeDetails, {
        memberId: get("memberId"), relationship: get("relationship"),
        firstName: get("firstName"), lastName: get("lastName"),
        dateOfBirth: get("dateOfBirth"), gender: get("gender"),
      });
      break;
    case "DEPENDENT_DELETION":
      Object.assign(changeDetails, {
        memberId: get("memberId"), dependentId: get("dependentId"),
        reason: get("reason"),
      });
      break;
    case "PACKAGE_UPGRADE":
    case "PACKAGE_DOWNGRADE":
      Object.assign(changeDetails, {
        newPackageId: get("newPackageId"), reason: get("reason"),
      });
      break;
    case "BENEFIT_MODIFICATION":
      Object.assign(changeDetails, {
        modificationType: get("modificationType"),
        benefitCategory: get("benefitCategory"),
        newLimit: get("newLimit"), modificationNotes: get("modificationNotes"),
      });
      break;
    case "GROUP_DATA_CHANGE":
      Object.assign(changeDetails, {
        contactPersonName: get("contactPersonName"),
        contactPersonPhone: get("contactPersonPhone"),
        contactPersonEmail: get("contactPersonEmail"),
        paymentFrequency: get("paymentFrequency"),
        address: get("address"),
      });
      break;
    case "SALARY_CHANGE":
      Object.assign(changeDetails, {
        memberId: get("memberId"), oldSalary: get("oldSalary"),
        newSalary: get("newSalary"), newContribution: get("newContribution"),
      });
      break;
    case "CORRECTION":
      Object.assign(changeDetails, {
        memberId: get("memberId"), fieldName: get("fieldName"),
        oldValue: get("oldValue"), newValue: get("newValue"),
        docRef: get("docRef"),
      });
      break;
  }

  if (get("notes")) changeDetails.notes = get("notes");

  // UAT-HF P08.03 (DEF-046) — E-015 evidence is captured HERE, not discovered at
  // approval. Every material endorsement raised through this form was previously
  // born unapprovable: the gate reads `sourceReference`/`documentReference`/
  // `docRef`, and this action wrote `notes`. The run filled Notes with an
  // explicit source reference, watched it render on the detail page, and was
  // still refused.
  //
  // Refusing at creation is the whole point of the fix. An operator who is told
  // now can fix it now; one who is told at approval has already handed the
  // request to a checker who cannot act on it and cannot supply the evidence
  // themselves without approving their own paperwork.
  const evidence = validateEvidence({
    type,
    sourceReference: get("sourceReference"),
  });
  if (!evidence.ok) {
    return { ok: false, error: evidence.message };
  }
  if (evidence.value) changeDetails.sourceReference = evidence.value;

  // Calculate pro-rata for financial types
  const FINANCIAL_TYPES = new Set(["MEMBER_ADDITION","MEMBER_DELETION","DEPENDENT_ADDITION","DEPENDENT_DELETION","PACKAGE_UPGRADE","PACKAGE_DOWNGRADE","SALARY_CHANGE"]);
  let proratedAmount = 0;

  if (FINANCIAL_TYPES.has(type)) {
    const renewal = new Date(group.renewalDate);
    const effective = new Date(effectiveDate);
    const daysRemaining = Math.max(0, Math.ceil((renewal.getTime() - effective.getTime()) / 86400000));
    const daily = Number(group.contributionRate) / 365;
    const isCredit = ["MEMBER_DELETION","DEPENDENT_DELETION","PACKAGE_DOWNGRADE"].includes(type);
    proratedAmount = isCredit ? -(daily * daysRemaining) : daily * daysRemaining;
  }

  // UAT-HF P08.04 (DEF-048 adjacent) — atomic numbering with a legible outcome.
  //
  // This was `peekNextDocumentNumber` + a bare `create`: max-plus-one with no
  // retry. `Endorsement` is unique on [tenantId, endorsementNumber], so two
  // concurrent submissions did not duplicate — they threw a raw P2002 at
  // whichever operator lost, which is the "outcomes legible" half of the task.
  // The same read-then-write shape was measured in P05.02 producing ONE unique
  // member number from fifty parallel allocations.
  //
  // `createWithDocumentNumber` advances and retries on a unique violation. It is
  // safe here because that index is the ONLY unique this create can violate.
  await createWithDocumentNumber(
    "END",
    (yp) =>
      prisma.endorsement
        .findFirst({ where: { tenantId, endorsementNumber: { startsWith: yp } }, orderBy: { endorsementNumber: "desc" }, select: { endorsementNumber: true } })
        .then((r) => r?.endorsementNumber ?? null),
    (endorsementNumber) =>
      prisma.endorsement.create({
        data: {
          tenantId,
          endorsementNumber,
          groupId,
          type: type as never,
          status: "SUBMITTED",
          effectiveDate: new Date(effectiveDate),
          changeDetails: changeDetails as never,
          proratedAmount,
          requestedBy: session.user.id,
        },
      }),
  );

  redirect("/endorsements");
}
