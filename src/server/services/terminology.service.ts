import { prisma } from "@/lib/prisma";
import type { TerminologyScope, TerminologyStatus } from "@prisma/client";

/**
 * Terminology engine (Medvex spec §2.4 / gap G2.4).
 *
 * Each client presents its own vocabulary while enums stay canonical in code.
 * `resolve()` picks the most-specific approved display text for a key in a
 * (client, locale) context, falling back through scopes and finally to a
 * code-level default:
 *
 *   CLIENT  (+locale)  →  CLIENT
 *   LOCALE
 *   HOUSE   (+locale)  →  HOUSE
 *   SYSTEM  (+locale)  →  SYSTEM
 *   → code fallback (or the key itself)
 *
 * Reads are served from a short-TTL in-memory cache of a tenant's approved
 * entries, invalidated explicitly on write (see invalidate()). For multi-
 * instance deployments, wire invalidate() to a Redis pub/sub channel (ioredis
 * is already available via src/lib/queue.ts) — left as a follow-up.
 */

export interface ResolveOpts {
  tenantId: string;
  key: string;
  clientId?: string | null;
  locale?: string | null;
  fallback?: string;
}

interface CachedEntry {
  scope: TerminologyScope;
  clientId: string | null;
  locale: string | null;
  key: string;
  displayText: string;
}

const SCOPE_WEIGHT: Record<TerminologyScope, number> = {
  CLIENT: 40,
  LOCALE: 30,
  HOUSE: 20,
  SYSTEM: 10,
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; entries: CachedEntry[] }>();

export class TerminologyService {
  /** Active + approved + currently-effective entries for a tenant (cached). */
  private static async load(tenantId: string): Promise<CachedEntry[]> {
    const hit = cache.get(tenantId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.entries;

    const now = new Date();
    const entries = await prisma.terminologyEntry.findMany({
      where: {
        tenantId,
        isActive: true,
        status: "APPROVED",
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      select: {
        scope: true,
        clientId: true,
        locale: true,
        key: true,
        displayText: true,
      },
    });
    cache.set(tenantId, { at: Date.now(), entries });
    return entries;
  }

  /** Drop a tenant's cached entries (call after any write to its dictionary). */
  static invalidate(tenantId: string): void {
    cache.delete(tenantId);
  }

  /**
   * Precedence score for an entry in a (clientId, locale) context.
   * Returns null when the entry does not apply to the context.
   */
  private static score(
    entry: CachedEntry,
    clientId?: string | null,
    locale?: string | null,
  ): number | null {
    switch (entry.scope) {
      case "CLIENT":
        if (!clientId || entry.clientId !== clientId) return null;
        break;
      case "LOCALE":
        if (!locale || entry.locale !== locale) return null;
        break;
      case "HOUSE":
      case "SYSTEM":
        break;
    }
    // A locale-specific entry only applies when the locale matches the request.
    if (entry.locale && entry.locale !== locale) return null;

    let s = SCOPE_WEIGHT[entry.scope];
    if (entry.locale && entry.locale === locale) s += 5; // more specific within scope
    return s;
  }

  private static pick(
    entries: CachedEntry[],
    key: string,
    clientId?: string | null,
    locale?: string | null,
  ): string | null {
    let best: { score: number; text: string } | null = null;
    for (const e of entries) {
      if (e.key !== key) continue;
      const sc = this.score(e, clientId, locale);
      if (sc === null) continue;
      if (!best || sc > best.score) best = { score: sc, text: e.displayText };
    }
    return best?.text ?? null;
  }

  /** Resolve a single key to its display text (or the fallback / the key). */
  static async resolve(opts: ResolveOpts): Promise<string> {
    const entries = await this.load(opts.tenantId);
    return (
      this.pick(entries, opts.key, opts.clientId, opts.locale) ??
      opts.fallback ??
      opts.key
    );
  }

  /**
   * Build the full key→displayText map for a (client, locale) context — every
   * key that has at least one applicable approved entry. Hydrates the frontend
   * TermProvider (useTerm) so client components show client-specific vocabulary.
   */
  static async getMap(
    tenantId: string,
    clientId?: string | null,
    locale?: string | null,
  ): Promise<Record<string, string>> {
    const entries = await this.load(tenantId);
    const out: Record<string, string> = {};
    for (const key of new Set(entries.map((e) => e.key))) {
      const picked = this.pick(entries, key, clientId, locale);
      if (picked) out[key] = picked;
    }
    return out;
  }

  /** Resolve many keys with a single tenant load. Returns a key→text map. */
  static async resolveMany(opts: {
    tenantId: string;
    clientId?: string | null;
    locale?: string | null;
    keys: string[];
    fallbacks?: Record<string, string>;
  }): Promise<Record<string, string>> {
    const entries = await this.load(opts.tenantId);
    const out: Record<string, string> = {};
    for (const key of opts.keys) {
      out[key] =
        this.pick(entries, key, opts.clientId, opts.locale) ??
        opts.fallbacks?.[key] ??
        key;
    }
    return out;
  }

  // ── Management / maker-checker write path ──────────────────────────────

  /** List dictionary entries for the admin console, newest first. */
  static async list(
    tenantId: string,
    filters?: {
      scope?: TerminologyScope;
      clientId?: string | null;
      status?: TerminologyStatus;
      key?: string;
    },
  ) {
    return prisma.terminologyEntry.findMany({
      where: {
        tenantId,
        ...(filters?.scope ? { scope: filters.scope } : {}),
        ...(filters?.clientId !== undefined ? { clientId: filters.clientId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.key ? { key: { contains: filters.key, mode: "insensitive" } } : {}),
      },
      include: { client: { select: { id: true, name: true } } },
      orderBy: [{ key: "asc" }, { createdAt: "desc" }],
    });
  }

  /** Validate scope ↔ clientId/locale coupling. */
  private static validateShape(input: {
    scope: TerminologyScope;
    clientId?: string | null;
    locale?: string | null;
  }) {
    if (input.scope === "CLIENT" && !input.clientId) {
      throw new Error("CLIENT-scoped terms require a clientId.");
    }
    if (input.scope === "LOCALE" && !input.locale) {
      throw new Error("LOCALE-scoped terms require a locale.");
    }
    if ((input.scope === "SYSTEM" || input.scope === "HOUSE") && input.clientId) {
      throw new Error(`${input.scope}-scoped terms cannot target a client.`);
    }
  }

  /** Create a DRAFT entry (maker). */
  static async createDraft(
    tenantId: string,
    data: {
      scope: TerminologyScope;
      clientId?: string | null;
      locale?: string | null;
      key: string;
      displayText: string;
      context?: string | null;
    },
    byUserId: string,
  ) {
    this.validateShape(data);
    return prisma.terminologyEntry.create({
      data: {
        tenantId,
        scope: data.scope,
        clientId: data.clientId ?? null,
        locale: data.locale ?? null,
        key: data.key.trim(),
        displayText: data.displayText,
        context: data.context ?? null,
        status: "DRAFT",
        createdById: byUserId,
      },
    });
  }

  /** Submit a DRAFT/REJECTED entry for approval (maker). */
  static async submit(tenantId: string, id: string, byUserId: string) {
    const entry = await prisma.terminologyEntry.findFirst({ where: { id, tenantId } });
    if (!entry) throw new Error("Terminology entry not found.");
    if (entry.status !== "DRAFT" && entry.status !== "REJECTED") {
      throw new Error("Only draft or rejected entries can be submitted.");
    }
    const [updated] = await prisma.$transaction([
      prisma.terminologyEntry.update({
        where: { id },
        data: { status: "PENDING_APPROVAL" },
      }),
      prisma.terminologyApproval.create({
        data: { tenantId, entryId: id, action: "SUBMITTED", byUserId },
      }),
    ]);
    return updated;
  }

  /**
   * Approve a PENDING entry (checker). Enforces segregation of duties
   * (checker ≠ maker), supersedes the prior active entry for the same
   * scope/client/locale/key (never-delete), and invalidates the cache.
   */
  static async approve(tenantId: string, id: string, byUserId: string, notes?: string) {
    const entry = await prisma.terminologyEntry.findFirst({ where: { id, tenantId } });
    if (!entry) throw new Error("Terminology entry not found.");
    if (entry.status !== "PENDING_APPROVAL") {
      throw new Error("Only entries pending approval can be approved.");
    }
    if (entry.createdById && entry.createdById === byUserId) {
      throw new Error("Segregation of duties: the maker cannot approve their own entry.");
    }

    const now = new Date();
    await prisma.$transaction([
      // Supersede the currently-active approved entry for the same coordinates.
      prisma.terminologyEntry.updateMany({
        where: {
          tenantId,
          scope: entry.scope,
          clientId: entry.clientId,
          locale: entry.locale,
          key: entry.key,
          status: "APPROVED",
          isActive: true,
          id: { not: id },
        },
        data: { isActive: false, effectiveTo: now },
      }),
      prisma.terminologyEntry.update({
        where: { id },
        data: { status: "APPROVED", isActive: true, approvedById: byUserId, effectiveFrom: now },
      }),
      prisma.terminologyApproval.create({
        data: { tenantId, entryId: id, action: "APPROVED", byUserId, notes },
      }),
    ]);
    this.invalidate(tenantId);
    return prisma.terminologyEntry.findUnique({ where: { id } });
  }

  /** Reject a PENDING entry (checker). */
  static async reject(tenantId: string, id: string, byUserId: string, notes?: string) {
    const entry = await prisma.terminologyEntry.findFirst({ where: { id, tenantId } });
    if (!entry) throw new Error("Terminology entry not found.");
    if (entry.status !== "PENDING_APPROVAL") {
      throw new Error("Only entries pending approval can be rejected.");
    }
    const [updated] = await prisma.$transaction([
      prisma.terminologyEntry.update({ where: { id }, data: { status: "REJECTED" } }),
      prisma.terminologyApproval.create({
        data: { tenantId, entryId: id, action: "REJECTED", byUserId, notes },
      }),
    ]);
    return updated;
  }
}
