import { prisma } from "@/lib/prisma";
import { Prisma, type ProviderType, type ProviderTier } from "@prisma/client";

type ProviderOperatingHoursInput = Prisma.InputJsonValue;

type NearbyProviderRow = {
  id: string;
  name: string;
  type: ProviderType;
  tier: ProviderTier;
  address: string | null;
  county: string | null;
  phone: string | null;
  email: string | null;
  isOpen24Hours: boolean;
  operatingHours: unknown | null;
  servicesOffered: string[];
  geoLatitude: number;
  geoLongitude: number;
  distance: number;
};

const PROCEDURE_CATALOG: Record<string, {
  label: string;
  cptCode: string;
  benefitCategory: string;
  serviceHint: string;
  fallbackCost: number;
}> = {
  "99213": { label: "General consultation", cptCode: "99213", benefitCategory: "OUTPATIENT", serviceHint: "Outpatient", fallbackCost: 2800 },
  "99214": { label: "Specialist consultation", cptCode: "99214", benefitCategory: "OUTPATIENT", serviceHint: "Outpatient", fallbackCost: 5200 },
  "85025": { label: "Full blood count", cptCode: "85025", benefitCategory: "OUTPATIENT", serviceHint: "Laboratory", fallbackCost: 1300 },
  "71046": { label: "Chest X-ray", cptCode: "71046", benefitCategory: "OUTPATIENT", serviceHint: "Imaging", fallbackCost: 3800 },
  "76700": { label: "Abdominal ultrasound", cptCode: "76700", benefitCategory: "OUTPATIENT", serviceHint: "Imaging", fallbackCost: 6500 },
  "59510": { label: "Caesarean section", cptCode: "59510", benefitCategory: "MATERNITY", serviceHint: "Maternity", fallbackCost: 90000 },
  "92004": { label: "Eye examination", cptCode: "92004", benefitCategory: "OPTICAL", serviceHint: "Optical", fallbackCost: 2800 },
};

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function providerHasService(provider: NearbyProviderRow, serviceHint?: string) {
  if (!serviceHint) return true;
  const needle = serviceHint.toLowerCase();
  return provider.servicesOffered.some((service) => service.toLowerCase().includes(needle));
}

export class ProvidersService {
  static getMemberProcedureCatalog() {
    return Object.values(PROCEDURE_CATALOG);
  }

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
    operatingHours?: ProviderOperatingHoursInput;
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
        operatingHours: data.operatingHours ?? Prisma.JsonNull,
      },
    });
  }

  /**
   * Update an existing provider
   */
  static async updateProvider(tenantId: string, id: string, data: Partial<Parameters<typeof ProvidersService.createProvider>[1]>) {
    const { contractStartDate, contractEndDate, operatingHours, ...rest } = data;

    return prisma.provider.update({
      where: { id, tenantId },
      data: {
        ...rest,
        ...(contractStartDate !== undefined
          ? { contractStartDate: contractStartDate ? new Date(contractStartDate) : null }
          : {}),
        ...(contractEndDate !== undefined
          ? { contractEndDate: contractEndDate ? new Date(contractEndDate) : null }
          : {}),
        ...(operatingHours !== undefined
          ? { operatingHours: operatingHours ?? Prisma.JsonNull }
          : {}),
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
    const providers = await prisma.$queryRaw<NearbyProviderRow[]>`
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

  static async getNearbyProvidersWithMemberEstimates(tenantId: string, memberId: string, params: {
    latitude: number;
    longitude: number;
    radiusKm: number;
    procedureCode?: string;
    providerTier?: ProviderTier | "ALL";
    serviceHint?: string;
  }) {
    const procedure = PROCEDURE_CATALOG[params.procedureCode ?? "99213"] ?? PROCEDURE_CATALOG["99213"];
    const providers = await this.getNearbyProviders(tenantId, {
      latitude: params.latitude,
      longitude: params.longitude,
      radiusKm: params.radiusKm,
    }) as NearbyProviderRow[];

    const filteredProviders = providers.filter((provider) => {
      if (params.providerTier && params.providerTier !== "ALL" && provider.tier !== params.providerTier) return false;
      return providerHasService(provider, params.serviceHint ?? procedure.serviceHint);
    });

    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      include: {
        package: {
          include: {
            currentVersion: { include: { benefits: true } },
          },
        },
        benefitUsages: {
          include: { benefitConfig: { select: { category: true } } },
        },
      },
    });

    const benefit = member?.package.currentVersion?.benefits.find((item) => item.category === procedure.benefitCategory);
    const usage = member?.benefitUsages.find((item) => item.benefitConfigId === benefit?.id);
    const remaining = Math.max(0, toNumber(benefit?.annualSubLimit) - toNumber(usage?.amountUsed));
    const copayPct = toNumber(benefit?.copayPercentage);

    const tariffs = await prisma.providerTariff.findMany({
      where: {
        providerId: { in: filteredProviders.map((provider) => provider.id) },
        isActive: true,
        cptCode: procedure.cptCode,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });
    const tariffByProvider = new Map<string, typeof tariffs[number]>();
    for (const tariff of tariffs) {
      if (!tariffByProvider.has(tariff.providerId)) tariffByProvider.set(tariff.providerId, tariff);
    }

    return filteredProviders.map((provider) => {
      const tariff = tariffByProvider.get(provider.id);
      const estimatedCost = tariff ? toNumber(tariff.agreedRate) : procedure.fallbackCost;
      const coveredBeforeCopay = Math.min(estimatedCost, remaining);
      const copay = Math.round((coveredBeforeCopay * copayPct) / 100);
      const excess = Math.max(0, estimatedCost - remaining);
      const estimatedMemberShare = Math.max(0, copay + excess);
      const planCovers = Math.max(0, estimatedCost - estimatedMemberShare);

      return {
        ...provider,
        geoLatitude: toNumber(provider.geoLatitude),
        geoLongitude: toNumber(provider.geoLongitude),
        distance: toNumber(provider.distance),
        estimate: {
          procedureCode: procedure.cptCode,
          procedureLabel: procedure.label,
          benefitCategory: procedure.benefitCategory,
          estimatedCost,
          planCovers,
          estimatedMemberShare,
          remainingBenefitBeforeVisit: remaining,
          confidence: tariff ? "TARIFF" : "FALLBACK",
          explanation: tariff
            ? "Based on this facility's active contracted tariff."
            : "Estimated from Avenue's default demo rate because no active tariff was found for this facility.",
        },
      };
    });
  }
}
