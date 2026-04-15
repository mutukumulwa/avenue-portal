"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function submitEndorsementAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);

  const tenantId = session.user.tenantId;
  const groupId       = formData.get("groupId") as string;
  const type          = formData.get("type") as string;
  const effectiveDate = formData.get("effectiveDate") as string;

  if (!groupId || !type || !effectiveDate) throw new Error("Missing required fields");

  // Build changeDetails based on type
  const get = (k: string) => (formData.get(k) as string | null) ?? "";

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
        newLimit: get("newLimit"), notes: get("notes"),
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

  // Calculate pro-rata for financial types
  const FINANCIAL_TYPES = new Set(["MEMBER_ADDITION","MEMBER_DELETION","DEPENDENT_ADDITION","DEPENDENT_DELETION","PACKAGE_UPGRADE","PACKAGE_DOWNGRADE","SALARY_CHANGE"]);
  let proratedAmount = 0;

  if (FINANCIAL_TYPES.has(type)) {
    const group = await prisma.group.findUnique({ where: { id: groupId, tenantId } });
    if (group) {
      const renewal = new Date(group.renewalDate);
      const effective = new Date(effectiveDate);
      const daysRemaining = Math.max(0, Math.ceil((renewal.getTime() - effective.getTime()) / 86400000));
      const daily = Number(group.contributionRate) / 365;
      const isCredit = ["MEMBER_DELETION","DEPENDENT_DELETION","PACKAGE_DOWNGRADE"].includes(type);
      proratedAmount = isCredit ? -(daily * daysRemaining) : daily * daysRemaining;
    }
  }

  const count = await prisma.endorsement.count({ where: { tenantId } });
  const endorsementNumber = `END-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

  await prisma.endorsement.create({
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
  });

  redirect("/endorsements");
}
