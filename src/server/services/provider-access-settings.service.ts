import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * PNOS F1.11 — provider-access feature settings, stored in Tenant.config
 * .providerAccess (same untyped-JSON pattern as TenantSettingsService.claims).
 *
 * Deny-by-default entitlement enforcement (D3) is OFF by default and is flipped
 * per tenant (global) or per provider (allow-list) ONLY after the network-ops
 * readiness sign-off. This module just READS the flag; flipping it is an
 * explicit, audited settings change made through the human gate.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export interface ProviderAccessSettings {
  /** global deny-by-default for the whole tenant */
  entitlementEnforcement: boolean;
  /** per-provider allow-list — enforcement is ON for these providers even if the global flag is off */
  enforcedProviderIds: string[];
}

export const PROVIDER_ACCESS_DEFAULTS: ProviderAccessSettings = {
  entitlementEnforcement: false,
  enforcedProviderIds: [],
};

export const ProviderAccessSettingsService = {
  /** Pure parse+validate of a raw Tenant.config value (never throws on garbage). */
  parse(config: unknown): ProviderAccessSettings {
    const pa =
      config && typeof config === "object" && "providerAccess" in config
        ? (config as Record<string, unknown>).providerAccess
        : undefined;
    const raw = (pa && typeof pa === "object" ? pa : {}) as Record<string, unknown>;
    return {
      entitlementEnforcement: raw.entitlementEnforcement === true,
      enforcedProviderIds: Array.isArray(raw.enforcedProviderIds)
        ? raw.enforcedProviderIds.filter((x): x is string => typeof x === "string")
        : [],
    };
  },

  async get(tenantId: string, db: Db = prisma): Promise<ProviderAccessSettings> {
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    return this.parse(tenant?.config);
  },

  /** Is deny-by-default entitlement enforced for this specific provider right now? */
  async isEntitlementEnforced(tenantId: string, providerId: string, db: Db = prisma): Promise<boolean> {
    const s = await this.get(tenantId, db);
    return s.entitlementEnforcement || s.enforcedProviderIds.includes(providerId);
  },
} as const;
