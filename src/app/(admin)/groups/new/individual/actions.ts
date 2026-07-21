"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { resolveSchemeClientId } from "@/server/services/clientResolve";
import { nextMemberNumber } from "@/server/services/member-numbering.service";

export async function enrollIndividualClientAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
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
    select: { id: true, contributionAmount: true, currentVersionId: true },
  });
  if (!pkg) throw new Error("Package not found.");

  const effectiveDateObj = new Date(effectiveDate);
  const renewalDate = new Date(effectiveDateObj);
  renewalDate.setFullYear(renewalDate.getFullYear() + 1);

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
      name:               `${firstName} ${lastName}`,
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

  await prisma.member.create({
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
      status:           "ACTIVE",
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "INDIVIDUAL_CLIENT_ENROLLED",
    module: "GROUPS",
    description: `Individual client enrolled: ${firstName} ${lastName} (${groupRef})`,
    metadata: { groupId: group.id, packageId },
  });

  redirect(`/groups/${group.id}`);
}
