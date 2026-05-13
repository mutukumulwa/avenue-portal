import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

// ─── AUDIT CHAIN SERVICE ─────────────────────────────────────────────────────
// Implements a hash-linked audit trail per the PSHP governance spec.
// Each entry stores a SHA-256 hash of its payload and the hash of the
// preceding entry, creating a tamper-evident chain.

export const auditChainService = {
  /**
   * Appends a new entry to the audit chain.
   * Must be called inside a Prisma transaction when mutations need to be atomic.
   *
   * @param actorId - The user performing the action
   * @param action  - Machine-readable action code, e.g. "QUOTATION:ISSUED"
   * @param module  - Module name, e.g. "QUOTATION"
   * @param entityType - e.g. "Quotation", "Member"
   * @param entityId   - The id of the affected record
   * @param payload    - The full payload to hash (will be JSON-serialized with sorted keys)
   * @param tenantId   - Tenant scope
   * @param description - Human-readable description
   */
  async append({
    actorId,
    action,
    module,
    entityType,
    entityId,
    payload,
    tenantId,
    description,
    ipAddress,
  }: {
    actorId: string;
    action: string;
    module: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
    tenantId: string;
    description: string;
    ipAddress?: string;
  }) {
    // Canonical JSON (sorted keys, no whitespace) for deterministic hashing
    const canonicalJson = JSON.stringify(payload, Object.keys(payload).sort());
    const payloadHash = createHash("sha256").update(canonicalJson).digest("hex");

    // Fetch the most recent entry in this tenant's chain for chaining
    const previousEntry = await prisma.auditLog.findFirst({
      where: { tenantId },
      orderBy: { chainSequence: "desc" },
      select: { payloadHash: true },
    });
    const previousHash = previousEntry?.payloadHash ?? null;

    return prisma.auditLog.create({
      data: {
        userId: actorId,
        tenantId,
        action,
        module,
        description,
        entityType,
        entityId,
        payloadHash,
        previousHash,
        ipAddress,
        // Cast required: Prisma's InputJsonValue is stricter than Record<string, unknown>
        metadata: payload as never,
      },
    });
  },

  /**
   * Verifies chain integrity for a tenant within a sequence range.
   * Re-computes each entry's hash and checks that previousHash values chain correctly.
   *
   * Returns { valid: true } if intact, or { valid: false, firstBreakAtSequence: number } if broken.
   */
  async verify(
    tenantId: string,
    opts?: { fromSequence?: bigint; toSequence?: bigint },
  ): Promise<{ valid: boolean; firstBreakAtSequence?: bigint; checkedCount: number }> {
    const entries = await prisma.auditLog.findMany({
      where: {
        tenantId,
        ...(opts?.fromSequence ? { chainSequence: { gte: opts.fromSequence } } : {}),
        ...(opts?.toSequence ? { chainSequence: { lte: opts.toSequence } } : {}),
      },
      orderBy: { chainSequence: "asc" },
      select: {
        chainSequence: true,
        metadata: true,
        payloadHash: true,
        previousHash: true,
      },
    });

    let prevHash: string | null = null;
    for (const entry of entries) {
      // Re-compute hash from stored metadata
      const payload = entry.metadata as Record<string, unknown> | null;
      if (payload && entry.payloadHash) {
        const canonical = JSON.stringify(payload, Object.keys(payload).sort());
        const recomputed = createHash("sha256").update(canonical).digest("hex");
        if (recomputed !== entry.payloadHash) {
          return { valid: false, firstBreakAtSequence: entry.chainSequence, checkedCount: entries.length };
        }
      }
      // Verify chain link (skip very first entry in range which may not have a known previous)
      if (prevHash !== null && entry.previousHash !== prevHash) {
        return { valid: false, firstBreakAtSequence: entry.chainSequence, checkedCount: entries.length };
      }
      prevHash = entry.payloadHash ?? prevHash;
    }

    return { valid: true, checkedCount: entries.length };
  },

  /**
   * Fetches audit entries for a tenant, filterable by entity, actor, and date range.
   * Returns paginated results suitable for the Audit Chain Explorer UI.
   */
  async list(
    tenantId: string,
    opts: {
      entityType?: string;
      entityId?: string;
      actorId?: string;
      module?: string;
      from?: Date;
      to?: Date;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const { page = 1, pageSize = 50 } = opts;
    const where = {
      tenantId,
      ...(opts.entityType ? { entityType: opts.entityType } : {}),
      ...(opts.entityId ? { entityId: opts.entityId } : {}),
      ...(opts.actorId ? { userId: opts.actorId } : {}),
      ...(opts.module ? { module: opts.module } : {}),
      ...(opts.from || opts.to
        ? {
            createdAt: {
              ...(opts.from ? { gte: opts.from } : {}),
              ...(opts.to ? { lte: opts.to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { chainSequence: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          chainSequence: true,
          userId: true,
          action: true,
          module: true,
          description: true,
          entityType: true,
          entityId: true,
          payloadHash: true,
          previousHash: true,
          createdAt: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  },
};
