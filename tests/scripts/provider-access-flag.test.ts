/**
 * The pure edit behind scripts/provider-access-flag.ts: one provider id in one
 * allow-list changes; every other setting is carried over; switching twice is a
 * no-op; and the result is what ProviderAccessSettingsService reads.
 */
import { describe, it, expect } from "vitest";
import { isProviderFlag, withProviderFlag } from "../../scripts/lib/provider-access-flag";
import { ProviderAccessSettingsService } from "@/server/services/provider-access-settings.service";

const FAMILY = "cmssrwr31000033vqpue454ou";

describe("withProviderFlag", () => {
  it("enables the price list for one facility on a tenant with no provider-access settings yet", () => {
    const r = withProviderFlag({ claims: { requireFraudClearanceBeforeApproval: true } }, "tariffCatalog", FAMILY, true);
    expect(r).toMatchObject({ before: [], after: [FAMILY], changed: true });
    expect(r.config).toEqual({ claims: { requireFraudClearanceBeforeApproval: true }, providerAccess: { tariffCatalogProviderIds: [FAMILY] } });
    const settings = ProviderAccessSettingsService.parse(r.config);
    expect(settings.tariffCatalogProviderIds).toEqual([FAMILY]);
    expect(settings.providerTariffCatalog).toBe(false); // never tenant-wide
    expect(settings.contractViewProviderIds).toEqual([]); // nothing else switched
  });

  it("keeps other lists and other providers, and is a no-op when already in that state", () => {
    const start = { providerAccess: { tariffCatalogProviderIds: ["p-other", FAMILY], contractViewProviderIds: ["p-x"], entitlementEnforcement: true } };
    const again = withProviderFlag(start, "tariffCatalog", FAMILY, true);
    expect(again.changed).toBe(false);
    expect(again.after).toEqual(["p-other", FAMILY]);
    const off = withProviderFlag(start, "tariffCatalog", FAMILY, false);
    expect(off).toMatchObject({ changed: true, after: ["p-other"] });
    expect(off.config.providerAccess).toEqual({ tariffCatalogProviderIds: ["p-other"], contractViewProviderIds: ["p-x"], entitlementEnforcement: true });
    expect(withProviderFlag(off.config, "tariffCatalog", FAMILY, false).changed).toBe(false);
  });

  it("tolerates a malformed config and knows only the four lists", () => {
    expect(withProviderFlag(null, "contractView", FAMILY, true).after).toEqual([FAMILY]);
    expect(withProviderFlag({ providerAccess: { tariffCatalogProviderIds: "nope" } }, "tariffCatalog", FAMILY, true).after).toEqual([FAMILY]);
    expect(isProviderFlag("tariffCatalog")).toBe(true);
    expect(isProviderFlag("providerTariffCatalog")).toBe(false);
    expect(isProviderFlag("__proto__")).toBe(false);
  });
});
