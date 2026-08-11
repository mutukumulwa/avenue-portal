/**
 * PNOS F1.4 — provider navigation model (pure, no React/next-auth).
 *
 * The permission→visible-items computation lives here so it is unit-testable
 * without rendering. The layout resolves the access context (F1.3) server-side
 * and calls computeProviderNav(ctx.permissions); ProviderNav (client) only
 * renders the already-filtered result. Navigation visibility is convenience —
 * NEVER the security boundary (spec §10.1): direct-URL access stays
 * server-authorized on each route.
 *
 * ONLY routes that already exist are listed. The §10.1 target adds Pre-auth,
 * Inbox, Payment queries, Contracts, Performance, Profile, Users, Integrations
 * — those are added by their own F3–F9 packages, never enabled early here.
 */

export type ProviderNavGroupKey = "Home" | "Care" | "Claims" | "Finance" | "Network" | "Administration";

export type ProviderNavIconKey =
  | "dashboard" | "inbox" | "eligibility" | "cases" | "preauth" | "claims" | "new-claim" | "settlements" | "contracts" | "performance" | "profile" | "users" | "api-keys" | "integrations";

/** Feature flags that gate a nav item's visibility (resolved server-side, passed to computeProviderNav). */
export type ProviderNavFlagKey = "contractView";

export interface ProviderNavDefinition {
  key: string;
  label: string;
  href: string;
  iconKey: ProviderNavIconKey;
  group: ProviderNavGroupKey;
  /** Undefined ⇒ always shown (e.g. Home). Otherwise the exact permission code required. */
  requiredPermission?: string;
  /**
   * When set, the item is emitted ONLY if this feature flag is on (in addition to
   * the permission check). Used for a surface that is gated behind a human
   * sign-off (F7.3 `contractView` → F7.1 §10) so the nav link never dead-ends on
   * a route that 404s until the flag is flipped.
   */
  flagKey?: ProviderNavFlagKey;
}

/** Existing provider routes only, in target-group order (§10.1). */
export const PROVIDER_NAV_DEFINITIONS: ProviderNavDefinition[] = [
  { key: "dashboard", label: "Dashboard", href: "/provider/dashboard", iconKey: "dashboard", group: "Home" },
  { key: "inbox", label: "Inbox", href: "/provider/inbox", iconKey: "inbox", group: "Home", requiredPermission: "provider.preauth.read" },
  { key: "eligibility", label: "Eligibility", href: "/provider/eligibility", iconKey: "eligibility", group: "Care", requiredPermission: "provider.eligibility.read" },
  { key: "cases", label: "Cases", href: "/provider/cases", iconKey: "cases", group: "Care", requiredPermission: "provider.case.read" },
  { key: "preauth", label: "Pre-auth", href: "/provider/preauth", iconKey: "preauth", group: "Care", requiredPermission: "provider.preauth.read" },
  { key: "claims", label: "Claims", href: "/provider/claims", iconKey: "claims", group: "Claims", requiredPermission: "provider.claim.read" },
  { key: "new-claim", label: "New Claim", href: "/provider/claims/new", iconKey: "new-claim", group: "Claims", requiredPermission: "provider.claim.create" },
  { key: "settlements", label: "Settlements", href: "/provider/settlements", iconKey: "settlements", group: "Finance", requiredPermission: "provider.settlement.read" },
  { key: "payment-queries", label: "Payment queries", href: "/provider/payment-queries", iconKey: "settlements", group: "Finance", requiredPermission: "provider.payment_query.manage" },
  // F7.3 — gated behind `contractView` (F7.1 §10 sign-off): hidden until the flag is on, even for a permitted user.
  { key: "contracts", label: "Contracts", href: "/provider/contracts", iconKey: "contracts", group: "Network", requiredPermission: "provider.contract.read", flagKey: "contractView" },
  // F8.5 — advisory performance dashboard (perm-gated, no flag).
  { key: "performance", label: "Performance", href: "/provider/performance", iconKey: "performance", group: "Network", requiredPermission: "provider.performance.read" },
  // F7.6 — read-only profile + change-request tracker (perm-gated, no flag).
  { key: "profile", label: "Profile", href: "/provider/profile", iconKey: "profile", group: "Administration", requiredPermission: "provider.profile.read" },
  // ELIG-GAP-005 — provider self-service user administration (F1.5 service, now with a UI).
  { key: "users", label: "Users", href: "/provider/users", iconKey: "users", group: "Administration", requiredPermission: "provider.users.manage" },
  { key: "api-keys", label: "API Keys", href: "/provider/api-keys", iconKey: "api-keys", group: "Administration", requiredPermission: "provider.api_keys.manage" },
  { key: "integrations", label: "Integrations", href: "/provider/integrations", iconKey: "integrations", group: "Administration", requiredPermission: "provider.integrations.manage" },
];

/**
 * DEF-002 — human labels for the provider persona role codes (prisma/seeds/
 * provider-rbac.ts). The signed-in-identity block showed a hard-coded generic
 * "Provider" for every provider user regardless of their actual persona; this
 * map turns the persona role code into the label an operator expects to see.
 *
 * Pure data (no React/next-auth) so the server layout can resolve the label and
 * pass only the finished string to the client nav — the persona role codes never
 * cross the boundary. PROVIDER_LEGACY is deliberately absent: a legacy/un-migrated
 * user resolves to null here and falls back to the generic "Provider".
 */
export const PROVIDER_ROLE_LABELS: Record<string, string> = {
  PROVIDER_FRONT_DESK: "Front Desk",
  PROVIDER_CLINICIAN: "Clinician",
  PROVIDER_BILLER: "Biller",
  PROVIDER_FINANCE: "Finance",
  PROVIDER_ADMIN: "Admin",
  PROVIDER_INTEGRATION_ADMIN: "Integration Admin",
};

/**
 * Most-representative-first precedence for the (rare) user holding more than one
 * persona role, so the displayed label is deterministic rather than dependent on
 * DB row order.
 */
const PROVIDER_PERSONA_PRIORITY: readonly string[] = [
  "PROVIDER_ADMIN",
  "PROVIDER_INTEGRATION_ADMIN",
  "PROVIDER_FINANCE",
  "PROVIDER_BILLER",
  "PROVIDER_CLINICIAN",
  "PROVIDER_FRONT_DESK",
];

/**
 * Resolve the persona label for a user from their active role codes
 * (rbacService.getUserRoles). Returns null when no persona role is present —
 * e.g. in production before the RBAC seed assigns persona roles — so the caller
 * falls back to the generic "Provider" persona.
 */
export function resolveProviderPersonaLabel(roleCodes: readonly string[]): string | null {
  for (const code of PROVIDER_PERSONA_PRIORITY) {
    if (roleCodes.includes(code)) return PROVIDER_ROLE_LABELS[code];
  }
  return null;
}

/** A browser-safe nav item — carries no permission/provider/branch authority. */
export interface ProviderNavItemView {
  key: string;
  label: string;
  href: string;
  iconKey: ProviderNavIconKey;
}

export interface ProviderNavGroupView {
  group: ProviderNavGroupKey;
  items: ProviderNavItemView[];
}

const GROUP_ORDER: ProviderNavGroupKey[] = ["Home", "Care", "Claims", "Finance", "Network", "Administration"];

function toView(d: ProviderNavDefinition): ProviderNavItemView {
  return { key: d.key, label: d.label, href: d.href, iconKey: d.iconKey };
}

/**
 * Compute the permission-filtered, grouped navigation for a provider user.
 *
 * FAIL-CLOSED (ELIG-GAP-004, Phase 2): a nav item is shown ONLY when the user
 * holds its exact required permission (Home has none, so it is always shown).
 * The previous "no provider.* permission ⇒ show the full set" legacy fallback is
 * REMOVED — every provider user is now provisioned with a persona role at
 * onboarding (Phase 1) or by the RBAC backfill (Phase 0), so a zero-permission
 * user is an error state that must see nothing, not everything.
 */
export function computeProviderNav(permissions: string[], opts: { flags?: Partial<Record<ProviderNavFlagKey, boolean>> } = {}): ProviderNavGroupView[] {
  const permSet = new Set(permissions);

  const visible = PROVIDER_NAV_DEFINITIONS.filter((d) => {
    // A flag-gated item is hidden until its flag is on (the underlying page is
    // 404-gated on the same flag).
    if (d.flagKey && !opts.flags?.[d.flagKey]) return false;
    if (!d.requiredPermission) return true; // Home
    return permSet.has(d.requiredPermission);
  });

  const byGroup = new Map<ProviderNavGroupKey, ProviderNavItemView[]>();
  for (const d of visible) {
    const arr = byGroup.get(d.group) ?? [];
    arr.push(toView(d));
    byGroup.set(d.group, arr);
  }
  return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({ group: g, items: byGroup.get(g)! }));
}

/** Flatten the grouped nav into an ordered item list (for the horizontal bar). */
export function flattenProviderNav(groups: ProviderNavGroupView[]): ProviderNavItemView[] {
  return groups.flatMap((g) => g.items);
}

/**
 * Page-access guard — the server-side counterpart of the nav filter.
 *
 * FAIL-CLOSED (ELIG-GAP-004, Phase 2): the caller must hold the exact `code`.
 * Nav visibility is convenience; a page independently authorizes direct-URL
 * access (§10.1) by calling this and redirecting to /unauthorized on false. The
 * previous "no provider.* permission ⇒ allow" legacy fallback is REMOVED — a
 * provider user with no duty permission is denied, matching the nav.
 */
export function providerPermits(permissions: string[], code: string): boolean {
  return permissions.includes(code);
}
