"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

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
  const groupCount = await prisma.group.count({ where: { tenantId } });
  const groupRef = `IND-${String(groupCount + 1).padStart(5, "0")}`;

  const group = await prisma.group.create({
    data: {
      tenantId,
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

  // Enroll the individual as principal member of their own group
  const memberCount = await prisma.member.count({ where: { tenantId } });
  const memberNumber = `AVH-${new Date().getFullYear()}-${String(memberCount + 1).padStart(5, "0")}`;

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
