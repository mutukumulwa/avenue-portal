import { prisma } from "@/lib/prisma";
import type { GroupStatus, PaymentFrequency } from "@prisma/client";

export class GroupsService {
  /**
   * Retrieves all groups for a given tenant
   */
  static async getGroups(tenantId: string) {
    return prisma.group.findMany({
      where: { tenantId },
      include: {
        package: true,
        _count: {
          select: { members: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retrieves a specific group by ID
   */
  static async getGroupById(tenantId: string, groupId: string) {
    return prisma.group.findUnique({
      where: { id: groupId, tenantId },
      include: {
        package: true,
      },
    });
  }

  /**
   * Enrolls a new Corporate Group and attaches a package
   */
  static async createGroup(tenantId: string, data: {
    name: string;
    industry?: string;
    registrationNumber?: string;
    contactPersonName: string;
    contactPersonPhone: string;
    contactPersonEmail: string;
    packageId: string;
    effectiveDate: string | Date;
  }) {
    const pkg = await prisma.package.findUnique({
      where: { id: data.packageId, tenantId },
      include: { currentVersion: true },
    });

    if (!pkg) throw new Error("Target package does not exist for this tenant.");

    const effectiveDateObj = new Date(data.effectiveDate);
    const renewalDate = new Date(effectiveDateObj);
    renewalDate.setFullYear(renewalDate.getFullYear() + 1);

    return prisma.group.create({
      data: {
        tenantId,
        name: data.name,
        industry: data.industry,
        registrationNumber: data.registrationNumber,
        contactPersonName: data.contactPersonName,
        contactPersonPhone: data.contactPersonPhone,
        contactPersonEmail: data.contactPersonEmail,
        packageId: pkg.id,
        packageVersionId: pkg.currentVersionId,
        contributionRate: pkg.contributionAmount,
        effectiveDate: effectiveDateObj,
        renewalDate: renewalDate,
        status: "ACTIVE",
      },
    });
  }

  /**
   * Updates editable fields on an existing group
   */
  static async updateGroup(tenantId: string, groupId: string, data: {
    name: string;
    industry?: string;
    registrationNumber?: string;
    address?: string;
    county?: string;
    contactPersonName: string;
    contactPersonPhone: string;
    contactPersonEmail: string;
    paymentFrequency: PaymentFrequency;
    effectiveDate: string | Date;
    renewalDate: string | Date;
    status: GroupStatus;
    notes?: string;
  }) {
    const group = await prisma.group.findUnique({ where: { id: groupId, tenantId } });
    if (!group) throw new Error("Group not found");

    return prisma.group.update({
      where: { id: groupId, tenantId },
      data: {
        name: data.name,
        industry: data.industry || null,
        registrationNumber: data.registrationNumber || null,
        address: data.address || null,
        county: data.county || null,
        contactPersonName: data.contactPersonName,
        contactPersonPhone: data.contactPersonPhone,
        contactPersonEmail: data.contactPersonEmail,
        paymentFrequency: data.paymentFrequency,
        effectiveDate: new Date(data.effectiveDate),
        renewalDate: new Date(data.renewalDate),
        status: data.status,
        notes: data.notes || null,
      },
    });
  }
}
