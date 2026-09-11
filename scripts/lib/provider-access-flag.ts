/**
 * The per-provider allow-lists in Tenant.config.providerAccess, and the one pure
 * edit the flag script makes to them. ProviderAccessSettingsService only READS
 * these (there is no settings screen); switching one is an explicit, audited
 * change made with scripts/provider-access-flag.ts.
 */
export const PROVIDER_FLAG_LISTS = {
  /** Family Hospital UAT plan P02.03 / P08.04 step 6 — price-list search and tariff-priced lines. */
  tariffCatalog: "tariffCatalogProviderIds",
  /** PNOS F7.3 — the provider contract/rate pages. */
  contractView: "contractViewProviderIds",
  /** PNOS F6.4 — the provider remittance detail. */
  remittanceV2: "remittanceV2ProviderIds",
  /** PNOS F1.11 — deny-by-default entitlement enforcement. */
  entitlement: "enforcedProviderIds",
} as const;

export type ProviderFlag = keyof typeof PROVIDER_FLAG_LISTS;

export function isProviderFlag(v: unknown): v is ProviderFlag {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PROVIDER_FLAG_LISTS, v);
}

/**
 * Add (enable) or remove (disable) one provider id in one allow-list. Every other
 * key of the config — and of `providerAccess` — is carried over untouched.
 */
export function withProviderFlag(
  config: unknown,
  flag: ProviderFlag,
  providerId: string,
  enabled: boolean,
): { config: Record<string, unknown>; before: string[]; after: string[]; changed: boolean } {
  const base = config && typeof config === "object" && !Array.isArray(config) ? (config as Record<string, unknown>) : {};
  const rawPa = base.providerAccess;
  const pa = rawPa && typeof rawPa === "object" && !Array.isArray(rawPa) ? (rawPa as Record<string, unknown>) : {};
  const key = PROVIDER_FLAG_LISTS[flag];
  const before = Array.isArray(pa[key]) ? (pa[key] as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const after = enabled ? (before.includes(providerId) ? before : [...before, providerId]) : before.filter((id) => id !== providerId);
  const changed = after.length !== before.length || after.some((id, i) => id !== before[i]);
  return { config: { ...base, providerAccess: { ...pa, [key]: after } }, before, after, changed };
}
