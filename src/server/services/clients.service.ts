import { prisma } from "@/lib/prisma";
import type { PayerType, ClientStatus } from "@prisma/client";

/**
 * Client = the payer entity (insurer / HMO / self-funded employer) whose schemes
 * Medvex administers (multi-client TPA tenancy, G2.1). Always scoped to the
 * operator Tenant. Never-delete: deactivation flips status/isActive + sets
 * effectiveTo rather than removing rows.
 */
export class ClientsService {
  /** Slugify a name into a URL/code-safe token, unique per operator. */
  static slugify(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "client";
  }

  static async list(operatorTenantId: string) {
    return prisma.client.findMany({
      where: { operatorTenantId },
      include: {
        parentClient: { select: { id: true, name: true } },
        _count: { select: { groups: true, subsidiaries: true, users: true } },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
  }

  static async getById(operatorTenantId: string, id: string) {
    return prisma.client.findFirst({
      where: { id, operatorTenantId },
      include: {
        parentClient: { select: { id: true, name: true } },
        subsidiaries: { select: { id: true, name: true, currency: true, status: true } },
        groups: { select: { id: true, name: true, status: true } },
      },
    });
  }

  static async create(
    operatorTenantId: string,
    data: {
      name: string;
      type: PayerType;
      currency?: string;
      slug?: string;
      parentClientId?: string | null;
      memberNumberPrefix?: string;
    },
  ) {
    const slug = this.slugify(data.slug || data.name);

    const existing = await prisma.client.findFirst({
      where: { operatorTenantId, slug },
      select: { id: true },
    });
    if (existing) {
      throw new Error(`A client with the code "${slug}" already exists.`);
    }

    // A parent must belong to the same operator (cross-operator nesting blocked).
    if (data.parentClientId) {
      const parent = await prisma.client.findFirst({
        where: { id: data.parentClientId, operatorTenantId },
        select: { id: true },
      });
      if (!parent) throw new Error("Parent client not found for this operator.");
    }

    return prisma.client.create({
      data: {
        operatorTenantId,
        type: data.type,
        name: data.name,
        slug,
        currency: data.currency?.trim().toUpperCase() || "UGX",
        memberNumberPrefix: data.memberNumberPrefix?.trim().toUpperCase() || "MVX",
        parentClientId: data.parentClientId || null,
        status: "ACTIVE",
      },
    });
  }

  static async update(
    operatorTenantId: string,
    id: string,
    data: {
      name?: string;
      type?: PayerType;
      currency?: string;
      status?: ClientStatus;
      parentClientId?: string | null;
      memberNumberPrefix?: string;
    },
  ) {
    const client = await prisma.client.findFirst({
      where: { id, operatorTenantId },
      select: { id: true },
    });
    if (!client) throw new Error("Client not found.");

    // Prevent a client from becoming its own parent.
    if (data.parentClientId && data.parentClientId === id) {
      throw new Error("A client cannot be its own parent.");
    }
    if (data.parentClientId) {
      const parent = await prisma.client.findFirst({
        where: { id: data.parentClientId, operatorTenantId },
        select: { id: true },
      });
      if (!parent) throw new Error("Parent client not found for this operator.");
    }

    const deactivating = data.status && data.status !== "ACTIVE";

    return prisma.client.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.currency !== undefined
          ? { currency: data.currency.trim().toUpperCase() || "UGX" }
          : {}),
        ...(data.memberNumberPrefix !== undefined
          ? { memberNumberPrefix: data.memberNumberPrefix.trim().toUpperCase() || "MVX" }
          : {}),
        ...(data.status !== undefined
          ? { status: data.status, isActive: data.status === "ACTIVE" }
          : {}),
        ...(deactivating ? { effectiveTo: new Date() } : {}),
        ...(data.parentClientId !== undefined
          ? { parentClientId: data.parentClientId || null }
          : {}),
      },
    });
  }
}
