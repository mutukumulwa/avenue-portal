import { prisma } from "@/lib/prisma";
import type { ProviderType, ProviderTier } from "@prisma/client";

export class ProvidersService {
  /**
   * List all providers for a tenant
   */
  static async getProviders(tenantId: string) {
    return prisma.provider.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
  }

  /**
   * Get a provider by ID
   */
  static async getProviderById(tenantId: string, id: string) {
    return prisma.provider.findUnique({
      where: { id, tenantId },
      include: {
        tariffs: { orderBy: { effectiveFrom: "desc" } },
      },
    });
  }

  /**
   * Register a new provider
   */
  static async createProvider(tenantId: string, data: {
    name: string;
    type: ProviderType;
    tier: ProviderTier;
    address?: string;
    county?: string;
    phone?: string;
    email?: string;
    contactPerson?: string;
    servicesOffered: string[];
    paymentTermDays: number;
    contractStatus: string;
    contractStartDate?: string;
    contractEndDate?: string;
    contractNotes?: string;
  }) {
    // Prevent exact duplicate names within the same tenant
    const existing = await prisma.provider.findFirst({
      where: { tenantId, name: { equals: data.name.trim(), mode: "insensitive" } },
    });
    if (existing) throw new Error(`A provider named "${data.name}" already exists.`);

    return prisma.provider.create({
      data: {
        tenantId,
        name: data.name.trim(),
        type: data.type,
        tier: data.tier,
        address: data.address || null,
        county: data.county || null,
        phone: data.phone || null,
        email: data.email || null,
        contactPerson: data.contactPerson || null,
        servicesOffered: data.servicesOffered,
        paymentTermDays: data.paymentTermDays,
        contractStatus: data.contractStatus,
        contractStartDate: data.contractStartDate ? new Date(data.contractStartDate) : null,
        contractEndDate: data.contractEndDate ? new Date(data.contractEndDate) : null,
        contractNotes: data.contractNotes || null,
      },
    });
  }
}
