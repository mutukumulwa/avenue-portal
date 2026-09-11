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
  resolveActiveProviderNavHref,
  PROVIDER_NAV_DEFINITIONS,
  PROVIDER_NAV_GROUPS,
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

  it("ELIG-GAP-004: a zero-permission user sees only Home (fail-closed; the full-set fallback is removed)", () => {
    // Home (dashboard) is the only definition with no requiredPermission.
    const homeHrefs = PROVIDER_NAV_DEFINITIONS.filter((d) => !d.requiredPermission).map((d) => d.href);
    expect(hrefs([])).toEqual(homeHrefs);
    // a user with only unrelated TPA perms is likewise denied every provider item
    expect(hrefs(["CLAIM:VIEW", "MEMBER:VIEW"])).toEqual(homeHrefs);
  });

  it("Home is always present even with an unrelated single provider perm", () => {
    expect(hrefs(["provider.settlement.read"])).toContain("/provider/dashboard");
  });

  it("never emits an unfinished route", () => {
    // NOTE: /provider/preauth (F3.8), /provider/inbox (F4.7), /provider/payment-queries (F6.11), /provider/profile (F7.6), /provider/performance (F8.5), /provider/integrations (F9.8), /provider/users (ELIG-GAP-005) are now FINISHED — removed from forbidden.
    // /provider/contracts (F7.3) is BUILT but flag-gated: with no flags passed it must stay hidden even with every permission.
    const forbidden = ["/provider/contracts"];
    // even a super-broad permission set only yields existing (and flag-enabled) routes
    const allPerms = PROVIDER_NAV_DEFINITIONS.map((d) => d.requiredPermission).filter(Boolean) as string[];
    const h = hrefs(allPerms);
    for (const f of forbidden) expect(h).not.toContain(f);
  });

  it("F7.3: Contracts is flag-gated — hidden without the flag (even with the permission), shown with flag + permission", () => {
    expect(hrefs(["provider.contract.read"])).not.toContain("/provider/contracts"); // permission but no flag
    const withFlag = flattenProviderNav(computeProviderNav(["provider.contract.read"], { flags: { contractView: true } })).map((i) => i.href);
    expect(withFlag).toContain("/provider/contracts");
  });

  it("F7.6: Profile shows for a user with provider.profile.read (perm-gated, no flag)", () => {
    expect(hrefs(["provider.profile.read"])).toContain("/provider/profile");
    expect(hrefs(["provider.claim.read"])).not.toContain("/provider/profile"); // migrated, lacks the perm
  });

  it("F9.8: Integrations shows for a user with provider.integrations.manage (perm-gated, no flag)", () => {
    expect(hrefs(["provider.integrations.manage"])).toContain("/provider/integrations");
    expect(hrefs(["provider.claim.read"])).not.toContain("/provider/integrations"); // migrated, lacks the perm
  });

  it("F8.5: Performance shows for a user with provider.performance.read (perm-gated, no flag)", () => {
    expect(hrefs(["provider.performance.read"])).toContain("/provider/performance");
    expect(hrefs(["provider.claim.read"])).not.toContain("/provider/performance");
  });

  it("F7.3: the flag alone does not reveal Contracts to a migrated user lacking the permission", () => {
    const h = flattenProviderNav(computeProviderNav(["provider.claim.read"], { flags: { contractView: true } })).map((i) => i.href);
    expect(h).not.toContain("/provider/contracts"); // migrated user, lacks provider.contract.read
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

  it("ELIG-GAP-004: denies a zero-permission user and a user with only unrelated perms (fail-closed)", () => {
    expect(providerPermits([], "provider.preauth.read")).toBe(false);
    expect(providerPermits(["CLAIM:VIEW", "MEMBER:VIEW"], "provider.preauth.read")).toBe(false);
  });
});

/**
 * Family Hospital UAT plan P06 (FH-08) — the grouping is the bar's information
 * architecture: four direct links, task-labelled menus, the account menu. The
 * plan's acceptance: each route belongs to exactly one visible group, and
 * permission filtering never leaves an empty group — without hiding anything
 * the user may open.
 */
describe("P06 grouped provider navigation", () => {
  const WITH_CONTRACTS = { flags: { contractView: true } };

  it("a facility administrator (the most destinations) gets four direct links, five task menus and the account menu", () => {
    const groups = computeProviderNav(PROVIDER_ROLE_PERMISSIONS.PROVIDER_FACILITY_ADMIN, WITH_CONTRACTS);
    expect(groups.map((g) => [g.group, g.label, g.presentation, g.items.map((i) => i.key)])).toEqual([
      ["primary", "Main", "direct", ["dashboard", "eligibility", "claims", "preauth"]],
      ["care", "Care & claims", "menu", ["inbox", "cases", "new-claim"]],
      ["finance", "Finance", "menu", ["settlements", "payment-queries"]],
      ["contracts", "Contracts & Services", "menu", ["contracts"]],
      ["reports", "Reports", "menu", ["performance"]],
      ["administration", "Administration", "menu", ["users", "api-keys", "integrations"]],
      ["account", "Account", "account", ["profile"]],
    ]);
    // Nothing the facility administrator may open is left out.
    expect(flattenProviderNav(groups).map((i) => i.href).sort()).toEqual(PROVIDER_NAV_DEFINITIONS.map((d) => d.href).sort());
  });

  it("Dashboard, Eligibility, Claims and Pre-auth are the direct destinations; the facility profile is in the account menu", () => {
    const direct = PROVIDER_NAV_DEFINITIONS.filter((d) => PROVIDER_NAV_GROUPS[d.group].presentation === "direct").map((d) => d.href);
    expect(direct).toEqual(["/provider/dashboard", "/provider/eligibility", "/provider/claims", "/provider/preauth"]);
    const account = PROVIDER_NAV_DEFINITIONS.filter((d) => PROVIDER_NAV_GROUPS[d.group].presentation === "account").map((d) => d.href);
    expect(account).toEqual(["/provider/profile"]);
  });

  it("for EVERY combination of permissions and the contract flag: each permitted route is in exactly one group, and no group is empty", () => {
    const codes = [...new Set(PROVIDER_NAV_DEFINITIONS.map((d) => d.requiredPermission).filter(Boolean) as string[])];
    const order = Object.keys(PROVIDER_NAV_GROUPS);
    let combinations = 0;
    for (let mask = 0; mask < 1 << codes.length; mask++) {
      const perms = codes.filter((_, i) => mask & (1 << i));
      for (const contractView of [false, true]) {
        combinations++;
        const groups = computeProviderNav(perms, { flags: { contractView } });
        const permitted = PROVIDER_NAV_DEFINITIONS.filter(
          (d) => (!d.flagKey || contractView) && (!d.requiredPermission || perms.includes(d.requiredPermission)),
        ).map((d) => d.href);
        const shown = groups.flatMap((g) => g.items.map((i) => i.href));
        if (groups.some((g) => g.items.length === 0)) throw new Error(`empty group for [${perms.join(",")}]`);
        if (new Set(shown).size !== shown.length) throw new Error(`a route is in two groups for [${perms.join(",")}]`);
        if ([...shown].sort().join() !== [...permitted].sort().join()) throw new Error(`permitted ≠ shown for [${perms.join(",")}]`);
        // canonical group order, each group once, labels/presentations from the one table
        const keys = groups.map((g) => g.group);
        expect(keys).toEqual(order.filter((k) => keys.includes(k as never)));
        for (const g of groups) expect([g.label, g.presentation]).toEqual([PROVIDER_NAV_GROUPS[g.group].label, PROVIDER_NAV_GROUPS[g.group].presentation]);
        expect(groups[0]).toMatchObject({ group: "primary" }); // Dashboard needs no permission
      }
    }
    expect(combinations).toBe(2 ** codes.length * 2);
  });

  it("a front-desk user gets no empty Finance/Administration menu", () => {
    const groups = computeProviderNav(PROVIDER_ROLE_PERMISSIONS.PROVIDER_FRONT_DESK);
    expect(groups.map((g) => g.group)).toEqual(["primary", "care", "account"]);
  });

  it("the active destination is the longest matching route, so detail pages light their parent and New Claim wins over Claims", () => {
    const hrefs = PROVIDER_NAV_DEFINITIONS.map((d) => d.href);
    expect(resolveActiveProviderNavHref("/provider/dashboard", hrefs)).toBe("/provider/dashboard");
    expect(resolveActiveProviderNavHref("/provider/claims", hrefs)).toBe("/provider/claims");
    expect(resolveActiveProviderNavHref("/provider/claims/clm-1/correct", hrefs)).toBe("/provider/claims");
    expect(resolveActiveProviderNavHref("/provider/claims/new", hrefs)).toBe("/provider/claims/new");
    expect(resolveActiveProviderNavHref("/provider/preauth/new", hrefs)).toBe("/provider/preauth");
    expect(resolveActiveProviderNavHref("/provider/inbox/req-1", hrefs)).toBe("/provider/inbox");
    // a segment boundary is required, and an unlisted page lights nothing
    expect(resolveActiveProviderNavHref("/provider/claimsx", hrefs)).toBeNull();
    expect(resolveActiveProviderNavHref("/provider/documents/doc-1", hrefs)).toBeNull();
    // only what the user can see is a candidate: without New Claim, its page lights Claims
    expect(resolveActiveProviderNavHref("/provider/claims/new", ["/provider/claims"])).toBe("/provider/claims");
  });
});
