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
    geoLatitude?: number;
    geoLongitude?: number;
    isOpen24Hours?: boolean;
    operatingHours?: any;
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
        geoLatitude: data.geoLatitude || null,
        geoLongitude: data.geoLongitude || null,
        isOpen24Hours: data.isOpen24Hours ?? false,
        operatingHours: data.operatingHours || null,
      },
    });
  }

  /**
   * Update an existing provider
   */
  static async updateProvider(tenantId: string, id: string, data: Partial<Parameters<typeof ProvidersService.createProvider>[1]>) {
    return prisma.provider.update({
      where: { id, tenantId },
      data: {
        ...data,
        contractStartDate: data.contractStartDate ? new Date(data.contractStartDate) : undefined,
        contractEndDate: data.contractEndDate ? new Date(data.contractEndDate) : undefined,
      },
    });
  }

  /**
   * Get providers within a specific radius (in km) using Haversine formula.
   */
  static async getNearbyProviders(tenantId: string, params: {
    latitude: number;
    longitude: number;
    radiusKm: number;
    packageVersionId?: string; // Future: filter by package access
    serviceType?: string;      // Future: filter by required service
  }) {
    // Raw SQL to calculate distance using Haversine formula
    const providers = await prisma.$queryRaw<any[]>`
      WITH distances AS (
        SELECT id, name, type, tier, address, county, phone, email, "isOpen24Hours", "operatingHours", "servicesOffered", "geoLatitude", "geoLongitude",
          ( 6371 * acos( cos( radians(${params.latitude}) ) * cos( radians( "geoLatitude" ) ) * cos( radians( "geoLongitude" ) - radians(${params.longitude}) ) + sin( radians(${params.latitude}) ) * sin( radians( "geoLatitude" ) ) ) ) AS distance
        FROM "Provider"
        WHERE "tenantId" = ${tenantId}
          AND "contractStatus" = 'ACTIVE'
          AND "geoLatitude" IS NOT NULL
          AND "geoLongitude" IS NOT NULL
      )
      SELECT * FROM distances
      WHERE distance <= ${params.radiusKm}
      ORDER BY distance ASC
    `;
    
    return providers;
  }
}
