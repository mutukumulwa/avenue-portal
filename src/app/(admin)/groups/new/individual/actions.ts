"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { resolveSchemeClientId } from "@/server/services/clientResolve";
import { nextMemberNumber } from "@/server/services/member-numbering.service";
import { coverageService } from "@/server/services/coverage.service";
import { assertEnrolmentAge } from "@/server/services/eligibility/enrolment-age";
import { groupCreateSchema } from "@/lib/validation/group";
import { normalizeLegalName } from "@/lib/normalize";

export async function enrollIndividualClientAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const tenantId = session.user.tenantId;

  const packageId   = formData.get("packageId") as string;
  const firstName   = formData.get("firstName") as string;
  const lastName    = formData.get("lastName") as string;
  const idNumber    = formData.get("idNumber") as string;
  const phone       = formData.get("phone") as string;
  const email       = formData.get("email") as string;
  const dateOfBirth = formData.get("dateOfBirth") as string;
  const gender      = formData.get("gender") as string;
  const effectiveDate = formData.get("effectiveDate") as string;
  const fundingMode = (formData.get("fundingMode") as string) || "INSURED";

  const pkg = await prisma.package.findUnique({
    where: { id: packageId, tenantId },
    select: { id: true, contributionAmount: true, currentVersionId: true, maxAge: true, dependentMaxAge: true },
  });
  if (!pkg) throw new Error("Package not found.");

  // WP-S1: route the synthetic scheme's identity + effective date through the
  // canonical schema (trim/collapse name, real-date + horizon guard) so an
  // Invalid Date can't reach Prisma. `.pick` keeps just the two scheme fields the
  // individual form supplies (the person's own name + start date).
  const schemeCheck = groupCreateSchema
    .pick({ name: true, effectiveDate: true })
    .safeParse({ name: `${firstName} ${lastName}`, effectiveDate });
  if (!schemeCheck.success) {
    throw new Error(schemeCheck.error.issues[0]?.message ?? "Invalid enrolment details.");
  }
  const schemeName = schemeCheck.data.name;
  const effectiveDateObj = schemeCheck.data.effectiveDate;
  const renewalDate = new Date(effectiveDateObj);
  renewalDate.setFullYear(renewalDate.getFullYear() + 1);

  // WP-3.5D: age gate — the individual client is enrolled as a PRINCIPAL, so the
  // package max-age applies as of the effective date (future/impossible DOB too).
  assertEnrolmentAge(
    { relationship: "PRINCIPAL", dateOfBirth: dateOfBirth, firstName, lastName },
    effectiveDateObj,
    pkg,
  );

  // Individual clients get a synthetic "group" record named after the person
  // B4-WIDE: seed the synthetic individual-group ref from max+1 (not count()+1)
  // so a purge/gap can't reuse a live ref. groupRef is IND-NNNNN (no year segment).
  const latestIndividual = await prisma.group.findFirst({
    where: { tenantId, clientType: "INDIVIDUAL", registrationNumber: { startsWith: "IND-" } },
    orderBy: { registrationNumber: "desc" },
    select: { registrationNumber: true },
  });
  const parsedGroupSeq = latestIndividual?.registrationNumber
    ? Number.parseInt(latestIndividual.registrationNumber.slice(latestIndividual.registrationNumber.lastIndexOf("-") + 1), 10)
    : 0;
  const groupRef = `IND-${String((Number.isFinite(parsedGroupSeq) ? parsedGroupSeq : 0) + 1).padStart(5, "0")}`;

  const group = await prisma.group.create({
    data: {
      tenantId,
      clientId:           await resolveSchemeClientId(tenantId, session.user.clientId),
      name:               schemeName,
      nameNormalized:     normalizeLegalName(schemeName),
      clientType:         "INDIVIDUAL",
      fundingMode:        fundingMode as never,
      contactPersonName:  `${firstName} ${lastName}`,
      contactPersonPhone: phone,
      contactPersonEmail: email,
      packageId,
      packageVersionId:   pkg.currentVersionId,
      contributionRate:   pkg.contributionAmount,
      effectiveDate:      effectiveDateObj,
      renewalDate,
      registrationNumber: groupRef,
      status:             "ACTIVE",
    },
  });

  // Enroll the individual as principal member of their own group (G9.6 prefix)
  const memberNumber = await nextMemberNumber(tenantId, session.user.clientId);

  const member = await prisma.member.create({
    data: {
      tenantId,
      groupId:          group.id,
      packageId,
      packageVersionId: pkg.currentVersionId,
      memberNumber,
      firstName,
      lastName,
      idNumber,
      dateOfBirth:      new Date(dateOfBirth),
      gender:           gender as never,
      relationship:     "PRINCIPAL",
      enrollmentDate:   effectiveDateObj,
      activationDate:   effectiveDateObj,
      coverStartDate:   effectiveDateObj,
      status:           "ACTIVE",
    },
  });

  // WP-3.5E: open a coverage period from the effective date so point-in-time
  // eligibility sees this member (previously individual enrolees got none).
  await coverageService.openPeriod(prisma, tenantId, member.id, effectiveDateObj, "ENROLMENT");

  await writeAudit({
    userId: session.user.id,
    action: "INDIVIDUAL_CLIENT_ENROLLED",
    module: "GROUPS",
    description: `Individual client enrolled: ${firstName} ${lastName} (${groupRef})`,
    metadata: { groupId: group.id, packageId },
  });

  redirect(`/groups/${group.id}`);
}
