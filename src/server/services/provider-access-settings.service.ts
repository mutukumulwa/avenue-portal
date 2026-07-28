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
  /**
   * F6.4 — provider-facing remittance surface (§11.1 `providerRemittanceV2`),
   * DEFAULT OFF. The provider settlement detail page renders only when this is
   * on for the tenant (global) or the specific provider (allow-list). Flipping it
   * on is the F6.1 §12 finance-sign-off gate, made through an explicit settings
   * change — this module only READS it.
   */
  providerRemittanceV2: boolean;
  /** per-provider allow-list — remittance V2 is ON for these providers even if the global flag is off */
  remittanceV2ProviderIds: string[];
  /**
   * F7.3 — provider-facing contract/rate visibility surface (§11.1
   * `providerContractView`), DEFAULT OFF. The /provider/contracts pages + the
   * rate CSV export render only when this is on for the tenant (global) or the
   * specific provider (allow-list). Flipping it on is the F7.1 §10 network/legal/
   * security-sign-off gate, made through an explicit settings change — this module
   * only READS it.
   */
  providerContractView: boolean;
  /** per-provider allow-list — contract view is ON for these providers even if the global flag is off */
  contractViewProviderIds: string[];
}

export const PROVIDER_ACCESS_DEFAULTS: ProviderAccessSettings = {
  entitlementEnforcement: false,
  enforcedProviderIds: [],
  providerRemittanceV2: false,
  remittanceV2ProviderIds: [],
  providerContractView: false,
  contractViewProviderIds: [],
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
      providerRemittanceV2: raw.providerRemittanceV2 === true,
      remittanceV2ProviderIds: Array.isArray(raw.remittanceV2ProviderIds)
        ? raw.remittanceV2ProviderIds.filter((x): x is string => typeof x === "string")
        : [],
      providerContractView: raw.providerContractView === true,
      contractViewProviderIds: Array.isArray(raw.contractViewProviderIds)
        ? raw.contractViewProviderIds.filter((x): x is string => typeof x === "string")
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

  /**
   * F6.4 — is the provider-facing remittance detail surface live for this
   * provider? DEFAULT false. On only when the tenant global flag or the
   * per-provider allow-list is set (the F6.1 §12 finance-sign-off gate).
   */
  async isRemittanceV2Enabled(tenantId: string, providerId: string, db: Db = prisma): Promise<boolean> {
    const s = await this.get(tenantId, db);
    return s.providerRemittanceV2 || s.remittanceV2ProviderIds.includes(providerId);
  },

  /**
   * F7.3 — is the provider-facing contract/rate surface live for this provider?
   * DEFAULT false. On only when the tenant global flag or the per-provider
   * allow-list is set (the F7.1 §10 network/legal/security sign-off gate).
   */
  async isContractViewEnabled(tenantId: string, providerId: string, db: Db = prisma): Promise<boolean> {
    const s = await this.get(tenantId, db);
    return s.providerContractView || s.contractViewProviderIds.includes(providerId);
  },
} as const;
