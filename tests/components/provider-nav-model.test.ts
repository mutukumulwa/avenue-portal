/**
 * F1.4 — provider navigation model (pure).
 *
 * Proves the permission→visible-nav computation is role-specific, that the
 * legacy/un-migrated fallback keeps the portal usable, that unfinished routes
 * are never emitted, and that the browser-safe view carries no authority
 * fields. Direct-URL server authorization is unchanged (requireProvider inside
 * resolveUserContext) — hiding here is convenience only; asserted by absence of
 * any permission/provider/branch field on the emitted items.
 */
import { describe, it, expect } from "vitest";
import {
  computeProviderNav,
  flattenProviderNav,
  providerPermits,
  PROVIDER_NAV_DEFINITIONS,
} from "@/components/layouts/provider-nav-model";
import { PROVIDER_ROLE_PERMISSIONS } from "@/../prisma/seeds/provider-rbac";

const hrefs = (perms: string[]) => flattenProviderNav(computeProviderNav(perms)).map((i) => i.href);

describe("F1.4 computeProviderNav", () => {
  it("a finance persona sees Finance + Home only (no clinical/claims/api-keys)", () => {
    const h = hrefs(PROVIDER_ROLE_PERMISSIONS.PROVIDER_FINANCE);
    expect(h).toContain("/provider/dashboard"); // Home always
    expect(h).toContain("/provider/settlements"); // provider.settlement.read
    expect(h).not.toContain("/provider/claims");
    expect(h).not.toContain("/provider/eligibility");
    expect(h).not.toContain("/provider/api-keys");
  });

  it("a biller persona sees claims/eligibility/cases/settlements but not api-keys", () => {
    const h = hrefs(PROVIDER_ROLE_PERMISSIONS.PROVIDER_BILLER);
    expect(h).toEqual(expect.arrayContaining([
      "/provider/dashboard", "/provider/eligibility", "/provider/cases", "/provider/claims", "/provider/claims/new", "/provider/settlements",
    ]));
    expect(h).not.toContain("/provider/api-keys");
  });

  it("an integration/admin persona with api-key perm sees API Keys", () => {
    expect(hrefs(PROVIDER_ROLE_PERMISSIONS.PROVIDER_INTEGRATION_ADMIN)).toContain("/provider/api-keys");
    expect(hrefs(PROVIDER_ROLE_PERMISSIONS.PROVIDER_ADMIN)).toContain("/provider/api-keys");
  });

  it("a front-desk persona sees eligibility + PA-less claims view but not settlement/api-keys", () => {
    const h = hrefs(PROVIDER_ROLE_PERMISSIONS.PROVIDER_FRONT_DESK);
    expect(h).toContain("/provider/eligibility");
    expect(h).toContain("/provider/claims"); // has provider.claim.read
    expect(h).not.toContain("/provider/claims/new"); // no provider.claim.create
    expect(h).not.toContain("/provider/settlements");
    expect(h).not.toContain("/provider/api-keys");
  });

  it("legacy/un-migrated user (no provider.* perms) sees the full working set (no blank portal)", () => {
    const h = hrefs([]);
    expect(h).toEqual(PROVIDER_NAV_DEFINITIONS.map((d) => d.href)); // all existing routes
    // a user with only unrelated TPA perms is also treated as legacy here
    expect(hrefs(["CLAIM:VIEW", "MEMBER:VIEW"])).toEqual(PROVIDER_NAV_DEFINITIONS.map((d) => d.href));
  });

  it("Home is always present even with an unrelated single provider perm", () => {
    expect(hrefs(["provider.settlement.read"])).toContain("/provider/dashboard");
  });

  it("never emits an unfinished route", () => {
    // NOTE: /provider/preauth (F3.8) and /provider/inbox (F4.7) are now FINISHED routes — removed from forbidden.
    const forbidden = ["/provider/payment-queries", "/provider/contracts", "/provider/performance", "/provider/profile", "/provider/users", "/provider/integrations"];
    // even a super-broad permission set only yields existing routes
    const allPerms = PROVIDER_NAV_DEFINITIONS.map((d) => d.requiredPermission).filter(Boolean) as string[];
    const h = hrefs(allPerms);
    for (const f of forbidden) expect(h).not.toContain(f);
  });

  it("emitted items carry no authority fields (no permission/provider/branch serialized)", () => {
    const items = flattenProviderNav(computeProviderNav(PROVIDER_ROLE_PERMISSIONS.PROVIDER_BILLER));
    for (const it of items) {
      expect(Object.keys(it).sort()).toEqual(["href", "iconKey", "key", "label"]);
    }
  });

  it("groups are ordered and non-empty", () => {
    const groups = computeProviderNav(PROVIDER_ROLE_PERMISSIONS.PROVIDER_BILLER);
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
    expect(groups.map((g) => g.group)).toEqual([...new Set(groups.map((g) => g.group))]); // no dup groups
  });

  it("F3.8: a user with provider.preauth.read sees the Pre-auth item; one without it does not", () => {
    expect(hrefs(["provider.preauth.read"])).toContain("/provider/preauth");
    expect(hrefs(["provider.claim.read"])).not.toContain("/provider/preauth"); // migrated, lacks the perm
  });

  it("F4.7: the Inbox item follows provider.preauth.read (shown with it, hidden without)", () => {
    expect(hrefs(["provider.preauth.read"])).toContain("/provider/inbox");
    expect(hrefs(["provider.claim.read"])).not.toContain("/provider/inbox");
  });
});

describe("F3.8 providerPermits (page-access guard)", () => {
  it("allows a migrated user holding the exact permission", () => {
    expect(providerPermits(["provider.preauth.read", "provider.claim.read"], "provider.preauth.read")).toBe(true);
  });

  it("denies a migrated user (has provider.* perms) lacking the exact permission", () => {
    expect(providerPermits(["provider.claim.read"], "provider.preauth.read")).toBe(false);
  });

  it("allows an un-migrated/legacy user (no provider.* perms) — matches the nav's rollout posture", () => {
    expect(providerPermits([], "provider.preauth.read")).toBe(true);
    expect(providerPermits(["CLAIM:VIEW", "MEMBER:VIEW"], "provider.preauth.read")).toBe(true);
  });
});
