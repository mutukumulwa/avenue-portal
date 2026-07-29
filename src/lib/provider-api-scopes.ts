/**
 * PNOS F1.6 — provider API-key scope catalog + route→scope map (pure data).
 *
 * A key's `scopes` array is drawn from PROVIDER_API_SCOPES. Each B2B route group
 * declares the scope it requires here; F1.7 enforces it per route group. Keeping
 * this as data lets F1.6 ship the catalog + tests before any route is migrated.
 */

export const PROVIDER_API_SCOPES = [
  "api.eligibility.read",
  "api.benefits.read",
  "api.preauth.write",
  "api.claim.write",
  "api.claim.read",
  "api.upload.write",
  "api.remittance.read",
  "api.integration.deliver",
] as const;

export type ProviderApiScope = (typeof PROVIDER_API_SCOPES)[number];

export const PROVIDER_API_SCOPE_SET: ReadonlySet<string> = new Set(PROVIDER_API_SCOPES);

/**
 * Route group → required scope. Keys are stable group identifiers (not literal
 * paths, which vary), consumed by the F1.7 per-route-group enforcement unit.
 */
export const ROUTE_SCOPE_CATALOG: Record<string, ProviderApiScope> = {
  eligibility: "api.eligibility.read",
  benefits: "api.benefits.read",
  "preauth.submit": "api.preauth.write",
  "claims.submit": "api.claim.write",
  "claims.read": "api.claim.read",
  upload: "api.upload.write",
  remittance: "api.remittance.read",
  "hms-batch": "api.integration.deliver",
} as const;

export function isKnownProviderApiScope(scope: string): scope is ProviderApiScope {
  return PROVIDER_API_SCOPE_SET.has(scope);
}

/**
 * F1.6 gap #5: may this user administer provider API keys? Legacy-aware (same
 * posture as F1.4): an un-migrated user (no provider.* permission) keeps today's
 * access; a migrated user must hold provider.api_keys.manage.
 */
export function permissionsAllowKeyAdmin(permissions: string[]): boolean {
  const migrated = permissions.some((p) => p.startsWith("provider."));
  return !migrated || permissions.includes("provider.api_keys.manage");
}
