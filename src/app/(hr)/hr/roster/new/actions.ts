"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { createWithDocumentNumber } from "@/lib/document-number";
import type { MemberRelationship, Gender } from "@prisma/client";
import type { ActionState } from "./types";
import { resolveMemberEnrolmentDates } from "@/lib/member-enrolment";
import { validateMemberAddress } from "@/lib/member-address";
import { calendarDateToUtcDate } from "@/lib/calendar-date";
import { validateMemberDemographics } from "@/lib/member-demographics";
import {
  blockingMatch,
  blockingMessage,
  candidateWarnings,
  findIdentityMatches,
} from "@/server/services/identity-match.service";

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

  // ── UAT-HF P05.04 — DEF-028 ──────────────────────────────────────────────
  //
  // "A phone number that the admin Register Member form refuses outright was
  // accepted without complaint by the HR portal Member Addition form, which
  // queued it ... The two enrolment paths therefore enforce different identity
  // rules."
  //
  // Both halves of that divergence are now closed. The phone half was closed by
  // relaxing the ADMIN side — DEC-07 says a household legitimately shares a
  // number, so refusing it was simply wrong (DEF-026). This closes the other
  // half: the HR path ran no identity probe at all, so an employer could submit
  // a joiner whose national ID already exists, be told it was "successfully
  // submitted", and only find out when the TPA's checker hit the block days
  // later.
  //
  // Same module, same rules, same normalisation as the admin path.
  const identityMatches = await findIdentityMatches(prisma, tenantId, {
    nationalId: idNumber,
    phone: demographics.value.phone,
    email: demographics.value.email,
    firstName: demographics.value.firstName,
    lastName: demographics.value.lastName,
    dateOfBirth: calendarDateToUtcDate(dates.value.dateOfBirth) ?? undefined,
  });

  const blocking = blockingMatch(identityMatches);
  if (blocking) {
    // A national-ID clash would be refused at approval anyway. Refusing it here
    // costs the employer one correction instead of a round trip through the TPA.
    // The message never names the other member — the same disclosure rule the
    // admin path follows (DEF-078).
    return {
      error: blockingMessage(blocking),
      fieldErrors: { idNumber: [blockingMessage(blocking)] },
    };
  }

  const warnings = candidateWarnings(identityMatches);

  // UAT-HF P08.04 — a request reference that cannot collide.
  //
  // This was `REQ-${year}-${Math.floor(10000 + Math.random() * 90000)}`: a
  // five-digit random number with no retry, against a column that is unique on
  // [tenantId, endorsementNumber]. Roughly 90,000 possible values means a
  // collision is a birthday problem, not a remote one — a few hundred requests
  // in a year and it is likely — and the loser got a raw P2002.
  //
  // Two things change. The reference is now sequential like every other document
  // in the product (an employer quoting "REQ-2026-88548" to their administrator
  // can be found in an ordered list), and `createWithDocumentNumber` advances on
  // a unique violation instead of failing. The REQ prefix is kept: it is what HR
  // sees and what the run's evidence quotes.
  const endorsement = await createWithDocumentNumber(
    "REQ",
    (yp) =>
      prisma.endorsement
        .findFirst({
          where: { tenantId, endorsementNumber: { startsWith: yp } },
          orderBy: { endorsementNumber: "desc" },
          select: { endorsementNumber: true },
        })
        .then((r) => r?.endorsementNumber ?? null),
    (endorsementNumber) =>
      prisma.endorsement.create({
        data: {
            endorsementNumber,
            tenantId,
            groupId,
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
      }),
  );

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
    // Candidate matches do not block — a household sharing a number is normal —
    // but the employer should know the TPA will see them, so the request is not
    // a surprise when it is queried.
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
