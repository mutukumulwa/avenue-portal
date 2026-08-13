"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import type { MemberRelationship, Gender } from "@prisma/client";
import type { ActionState } from "./types";
import { resolveMemberEnrolmentDates } from "@/lib/member-enrolment";
import { validateMemberAddress } from "@/lib/member-address";
import { calendarDateToUtcDate } from "@/lib/calendar-date";
import { validateMemberDemographics } from "@/lib/member-demographics";

export async function addMemberEndorsementAction(
  _prev: ActionState,
  formData: FormData
) {
  const session = await requireRole(ROLES.HR);
  const groupId = session.user.groupId;
  const tenantId = session.user.tenantId;

  if (!groupId) return { error: "No corporate group associated with your account." };

  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const firstName = text("firstName");
  const lastName = text("lastName");
  const dateOfBirth = text("dateOfBirth");
  const gender = text("gender") as Gender;
  const relationship = text("relationship") as MemberRelationship;
  const idNumber = text("idNumber") || null;
  const phone = text("phone") || null;
  const email = text("email") || null;
  const effectiveDate = text("effectiveDate");
  const birthNotificationDate = text("birthNotificationDate");
  const principalIdNumber = text("principalIdNumber");
  const sourceReference = text("sourceReference");

  const fieldErrors: Record<string, string[]> = {};
  const demographics = validateMemberDemographics({
    firstName,
    lastName,
    gender,
    relationship,
    phone,
    email,
  });
  if (!demographics.ok) Object.assign(fieldErrors, demographics.fieldErrors);
  if (relationship !== "PRINCIPAL" && !principalIdNumber) {
    fieldErrors.principalIdNumber = ["Enter the principal member's National ID so this dependant joins the correct family unit."];
  }
  if (!sourceReference) {
    fieldErrors.sourceReference = ["Enter the HR letter, payroll instruction or supporting document reference."];
  } else if (sourceReference.length > 120) {
    fieldErrors.sourceReference = ["Use 120 characters or fewer for the source reference."];
  }
  const dates = resolveMemberEnrolmentDates({
    dateOfBirth,
    effectiveDate,
    birthNotificationDate,
    relationship,
  });
  if (!dates.ok) Object.assign(fieldErrors, dates.fieldErrors);
  const address = validateMemberAddress({
    addressCountry: text("addressCountry"),
    addressDistrict: text("addressDistrict"),
    addressLocality: text("addressLocality"),
    addressSubcounty: text("addressSubcounty"),
    addressParish: text("addressParish"),
    addressVillage: text("addressVillage"),
    addressLine: text("addressLine"),
    addressLatitude: text("addressLatitude"),
    addressLongitude: text("addressLongitude"),
    addressCoordinateConsent: text("addressCoordinateConsent"),
  });
  if (!address.ok) Object.assign(fieldErrors, address.fieldErrors);
  if (Object.keys(fieldErrors).length > 0 || !dates.ok || !address.ok || !demographics.ok) {
    return { error: "Correct the highlighted member details. Nothing has been submitted.", fieldErrors };
  }

  const endorsementNumber = `REQ-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

  const endorsement = await prisma.endorsement.create({
    data: {
      tenantId,
      groupId,
      endorsementNumber,
      type: "MEMBER_ADDITION",
      status: "SUBMITTED",
      effectiveDate: calendarDateToUtcDate(dates.value.requestedEffectiveDate)!,
      requestedBy: session.user.id,
      changeDetails: {
         firstName: demographics.value.firstName,
         lastName: demographics.value.lastName,
         dateOfBirth: dates.value.dateOfBirth,
         gender: demographics.value.gender,
         relationship: demographics.value.relationship,
         idNumber,
         phone: demographics.value.phone,
         email: demographics.value.email,
         principalIdNumber: principalIdNumber || null,
         sourceReference,
         birthNotificationDate: dates.value.birthNotificationDate,
         addressCountry: address.value.addressCountry,
         addressDistrict: address.value.addressDistrict,
         addressLocality: address.value.addressLocality,
         addressSubcounty: address.value.addressSubcounty,
         addressParish: address.value.addressParish,
         addressVillage: address.value.addressVillage,
         addressLine: address.value.addressLine,
         addressLatitude: address.value.addressLatitude,
         addressLongitude: address.value.addressLongitude,
         addressCoordinateConsent: address.value.hasCoordinateConsent,
      }
    }
  });

  // WP-3.5G: audit the (previously silent) HR add-member request.
  await writeAudit({
    userId: session.user.id,
    action: "HR_MEMBER_ADDITION_REQUESTED",
    module: "MEMBERS",
    description: `HR requested member addition: ${firstName} ${lastName} (${relationship}) — ${endorsement.endorsementNumber}`,
    metadata: { groupId, endorsementNumber: endorsement.endorsementNumber, relationship },
  });

  return {
    success: true,
    endorsementNumber: endorsement.endorsementNumber,
    resultingCoverStart: dates.value.coverStartDate,
  };
}
