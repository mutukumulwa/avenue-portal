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
  | "dashboard" | "inbox" | "eligibility" | "cases" | "preauth" | "claims" | "new-claim" | "settlements" | "contracts" | "api-keys";

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
  { key: "api-keys", label: "API Keys", href: "/provider/api-keys", iconKey: "api-keys", group: "Administration", requiredPermission: "provider.api_keys.manage" },
];

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
 * Backward-compatible rollout posture (no silent flip, spec D3 spirit): a user
 * with NO provider.* permission is treated as un-migrated (legacy) and sees the
 * full current working set, so enabling this nav does not blank the portal for
 * existing users before F1.9 assigns persona roles. A user who HAS any provider
 * permission is filtered precisely to what they hold (Home is always shown).
 */
export function computeProviderNav(permissions: string[], opts: { flags?: Partial<Record<ProviderNavFlagKey, boolean>> } = {}): ProviderNavGroupView[] {
  const permSet = new Set(permissions);
  const hasAnyProviderPerm = permissions.some((p) => p.startsWith("provider."));

  const visible = PROVIDER_NAV_DEFINITIONS.filter((d) => {
    // A flag-gated item is hidden until its flag is on — regardless of permission
    // or the legacy fallback (the underlying page is 404-gated on the same flag).
    if (d.flagKey && !opts.flags?.[d.flagKey]) return false;
    if (!d.requiredPermission) return true; // Home
    if (!hasAnyProviderPerm) return true; // legacy/un-migrated → full set
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
 * Page-access guard — the server-side counterpart of the nav's legacy posture.
 *
 * Nav visibility is convenience; a page must independently authorize direct-URL
 * access (§10.1). To stay consistent with computeProviderNav during the pre-F1.9
 * rollout: a MIGRATED user (holds any provider.* permission) needs the exact
 * `code`; an UN-MIGRATED/legacy user (no provider.* permission at all) is allowed
 * so the portal is not broken before persona roles are assigned. Pages call this
 * and redirect to /unauthorized on false.
 */
export function providerPermits(permissions: string[], code: string): boolean {
  const hasAnyProviderPerm = permissions.some((p) => p.startsWith("provider."));
  return !hasAnyProviderPerm || permissions.includes(code);
}
