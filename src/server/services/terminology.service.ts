import { prisma } from "@/lib/prisma";
import type { TerminologyScope } from "@prisma/client";

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
}
