import { prisma } from "@/lib/prisma";
import type { PayerType, ClientStatus } from "@prisma/client";
import { normalizeLegalName, normalizePrefix } from "@/lib/normalize";

/**
 * Client = the payer entity (insurer / HMO / self-funded employer) whose schemes
 * Medvex administers (multi-client TPA tenancy, G2.1). Always scoped to the
 * operator Tenant. Never-delete: deactivation flips status/isActive + sets
 * effectiveTo rather than removing rows.
 */
export class ClientsService {
  /** Slugify a name into a URL/code-safe token, unique per operator. */
  static slugify(input: string): string {
    return (
      input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "client"
    );
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

  /**
   * Does the client have any downstream activity that freezes its currency (D8 /
   * C-005)? Members, invoices and claims all hang off Group (which requires
   * clientId), so a scheme is the necessary precondition for all of them; each is
   * still checked explicitly for defence-in-depth, plus the client-scoped
   * admin-fee ledger as the GL signal (JournalEntry is tenant-scoped only and
   * cannot be attributed to a single client).
   */
  static async hasFinancialActivity(operatorTenantId: string, id: string): Promise<boolean> {
    // Confirm ownership first so a foreign id can never report "no activity".
    const client = await prisma.client.findFirst({
      where: { id, operatorTenantId },
      select: { id: true },
    });
    if (!client) return false;

    const [groups, members, invoices, claims, ledger] = await Promise.all([
      prisma.group.count({ where: { clientId: id } }),
      prisma.member.count({ where: { group: { clientId: id } } }),
      prisma.invoice.count({ where: { group: { clientId: id } } }),
      prisma.claim.count({ where: { member: { group: { clientId: id } } } }),
      prisma.adminFeeLedgerEntry.count({ where: { clientId: id } }),
    ]);
    return groups + members + invoices + claims + ledger > 0;
  }

  static async create(
    operatorTenantId: string,
    data: {
      name: string;
      type: PayerType;
      currency: string;
      slug?: string;
      parentClientId?: string | null;
      memberNumberPrefix?: string;
    },
  ) {
    const slug = this.slugify(data.slug || data.name);
    const nameNormalized = normalizeLegalName(data.name);

    // Prefix: default MVX only for the omitted case (the per-tenant fallback
    // client legitimately holds it); an explicit prefix must pass D3 (defence —
    // the action validates first, this guards the service door).
    let memberNumberPrefix = "MVX";
    if (data.memberNumberPrefix != null && data.memberNumberPrefix !== "") {
      const canonical = normalizePrefix(data.memberNumberPrefix);
      if (!canonical) throw new Error("Invalid member-number prefix.");
      memberNumberPrefix = canonical;
    }

    // A parent must belong to the same operator (cross-operator nesting blocked).
    if (data.parentClientId) {
      const parent = await prisma.client.findFirst({
        where: { id: data.parentClientId, operatorTenantId },
        select: { id: true },
      });
      if (!parent) throw new Error("Parent client not found for this operator.");
    }

    // Uniqueness (slug / nameNormalized / memberNumberPrefix) is enforced by the
    // DB unique indexes and mapped to a friendly field error by the caller — no
    // TOCTOU pre-check (two concurrent identical submits → exactly one row).
    return prisma.client.create({
      data: {
        operatorTenantId,
        type: data.type,
        name: data.name,
        nameNormalized,
        slug,
        currency: data.currency,
        memberNumberPrefix,
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

    const reactivating = data.status === "ACTIVE";
    const deactivating = data.status !== undefined && data.status !== "ACTIVE";

    // slug and memberNumberPrefix are intentionally NOT updatable (immutable
    // post-creation, DEF-012 — a rename would orphan minted member numbers).
    return prisma.client.update({
      where: { id },
      data: {
        ...(data.name !== undefined
          ? { name: data.name, nameNormalized: normalizeLegalName(data.name) }
          : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.status !== undefined
          ? { status: data.status, isActive: data.status === "ACTIVE" }
          : {}),
        // Reactivation clears the deactivation stamp; deactivation sets it.
        ...(reactivating ? { effectiveTo: null } : {}),
        ...(deactivating ? { effectiveTo: new Date() } : {}),
        ...(data.parentClientId !== undefined
          ? { parentClientId: data.parentClientId || null }
          : {}),
      },
    });
  }
}
