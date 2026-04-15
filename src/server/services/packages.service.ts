import { prisma } from "@/lib/prisma";


export class PackagesService {
  /**
   * Retrieves all packages for a given tenant
   */
  static async getPackages(tenantId: string) {
    return prisma.package.findMany({
      where: { tenantId },
      include: {
        currentVersion: {
          include: {
            benefits: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retrieves a specific package by ID
   */
  static async getPackageById(tenantId: string, packageId: string) {
    return prisma.package.findUnique({
      where: { id: packageId, tenantId },
      include: {
        versions: {
          include: {
            benefits: true,
          },
          orderBy: { versionNumber: "desc" },
        },
        currentVersion: {
          include: {
            benefits: true,
          },
        },
      },
    });
  }

  /**
   * Creates a new package with an initial version and benefits
   */
  static async createPackage(tenantId: string, data: {
    name: string;
    description?: string;
    type: "INDIVIDUAL" | "FAMILY" | "GROUP" | "CORPORATE";
    annualLimit: number;
    contributionAmount: number;
    minAge?: number;
    maxAge?: number;
    dependentMaxAge?: number;
    exclusions?: string[];
    status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
    benefits: {
      category: "INPATIENT" | "OUTPATIENT" | "MATERNITY" | "DENTAL" | "OPTICAL" | "MENTAL_HEALTH" | "CHRONIC_DISEASE" | "SURGICAL" | "AMBULANCE_EMERGENCY" | "LAST_EXPENSE" | "WELLNESS_PREVENTIVE" | "REHABILITATION" | "CUSTOM";
      annualSubLimit: number;
      copayPercentage?: number;
      waitingPeriodDays?: number;
    }[];
  }) {
    const newPackage = await prisma.package.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description,
        type: data.type,
        annualLimit: data.annualLimit,
        contributionAmount: data.contributionAmount,
        minAge: data.minAge ?? 0,
        maxAge: data.maxAge ?? 65,
        dependentMaxAge: data.dependentMaxAge ?? 24,
        exclusions: data.exclusions ?? [],
        status: data.status ?? "DRAFT",
        versions: {
          create: {
            versionNumber: 1,
            effectiveFrom: new Date(),
            benefits: {
              create: data.benefits.map((b) => ({
                category: b.category,
                annualSubLimit: b.annualSubLimit,
                copayPercentage: b.copayPercentage ?? 0,
                waitingPeriodDays: b.waitingPeriodDays ?? 0,
                exclusions: [],
              })),
            },
          },
        },
      },
      include: {
        versions: true,
      },
    });

    // Set the current version
    const currentVersion = newPackage.versions[0];
    return prisma.package.update({
      where: { id: newPackage.id },
      data: { currentVersionId: currentVersion.id },
    });
  }
}
