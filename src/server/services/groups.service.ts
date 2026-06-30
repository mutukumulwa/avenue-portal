import { prisma } from "@/lib/prisma";
import type { GroupStatus, PaymentFrequency } from "@prisma/client";

export class GroupsService {
  /**
   * Client-isolation filter (G2.1). When `clientId` is provided the caller is
   * confined to that client; when omitted the caller is operator-level and
   * spans every client in the tenant.
   */
  private static clientWhere(clientId?: string) {
    return clientId ? { clientId } : {};
  }

  /**
   * Resolve the client a newly-created scheme belongs to. A confined/selected
   * client wins; otherwise the scheme attaches to the tenant's default client
   * (slug `default`) so the `clientId` column is always populated during the
   * multi-client rollout (G2.1). The client switcher (slice 4) lets operator
   * users pick a specific client instead of the default.
   */
  private static async resolveWriteClientId(tenantId: string, clientId?: string) {
    if (clientId) return clientId;
    const fallback = await prisma.client.findFirst({
      where: { operatorTenantId: tenantId, slug: "default" },
      select: { id: true },
    });
    return fallback?.id; // may be undefined if no default seeded — column stays null
  }

  /**
   * Retrieves all groups for a given tenant (and client, when confined).
   */
  static async getGroups(tenantId: string, clientId?: string) {
    return prisma.group.findMany({
      where: { tenantId, ...this.clientWhere(clientId) },
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
   * Retrieves a specific group by ID, scoped to tenant (and client, when confined).
   */
  static async getGroupById(tenantId: string, groupId: string, clientId?: string) {
    return prisma.group.findFirst({
      where: { id: groupId, tenantId, ...this.clientWhere(clientId) },
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
  }, clientId?: string) {
    const pkg = await prisma.package.findUnique({
      where: { id: data.packageId, tenantId },
      include: { currentVersion: true },
    });

    if (!pkg) throw new Error("Target package does not exist for this tenant.");

    const existing = await prisma.group.findFirst({
      where: { tenantId, name: { equals: data.name, mode: "insensitive" } },
    });
    if (existing) {
      throw new Error(`A group named "${data.name}" already exists.`);
    }

    const effectiveDateObj = new Date(data.effectiveDate);
    const renewalDate = new Date(effectiveDateObj);
    renewalDate.setFullYear(renewalDate.getFullYear() + 1);

    const resolvedClientId = await this.resolveWriteClientId(tenantId, clientId);

    return prisma.group.create({
      data: {
        tenantId,
        clientId: resolvedClientId,
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
  }, clientId?: string) {
    // Scope the lookup to the caller's client when confined (G2.1) so a confined
    // user cannot reach another client's scheme within the same tenant.
    const group = await prisma.group.findFirst({
      where: { id: groupId, tenantId, ...this.clientWhere(clientId) },
    });
    if (!group) throw new Error("Group not found");

    return prisma.group.update({
      where: { id: groupId },
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
