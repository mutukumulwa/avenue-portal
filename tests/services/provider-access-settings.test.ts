/**
 * F1.11 + F6.4 — ProviderAccessSettingsService flag parsing + gates (pure).
 *
 * No DB: an injected fake db returns a Tenant.config so the async gates are
 * exercised deterministically. Covers the F6.4 providerRemittanceV2 gate
 * (default OFF; tenant-global or per-provider allow-list) and the F1.11
 * entitlement gate it mirrors.
 */
import { describe, it, expect } from "vitest";
import { ProviderAccessSettingsService, PROVIDER_ACCESS_DEFAULTS } from "@/server/services/provider-access-settings.service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeDb = (config: unknown): any => ({ tenant: { findUnique: async () => ({ config }) } });

describe("ProviderAccessSettingsService.parse", () => {
  it("defaults to all-off on empty / garbage config", () => {
    expect(ProviderAccessSettingsService.parse(undefined)).toEqual(PROVIDER_ACCESS_DEFAULTS);
    expect(ProviderAccessSettingsService.parse(null)).toEqual(PROVIDER_ACCESS_DEFAULTS);
    expect(ProviderAccessSettingsService.parse(42)).toEqual(PROVIDER_ACCESS_DEFAULTS);
    expect(ProviderAccessSettingsService.parse({ providerAccess: "nope" })).toEqual(PROVIDER_ACCESS_DEFAULTS);
  });

  it("reads the F6.4 remittance flags and filters non-string ids", () => {
    const s = ProviderAccessSettingsService.parse({
      providerAccess: { providerRemittanceV2: true, remittanceV2ProviderIds: ["p1", 7, "p2", null] },
    });
    expect(s.providerRemittanceV2).toBe(true);
    expect(s.remittanceV2ProviderIds).toEqual(["p1", "p2"]);
  });

  it("only `=== true` enables a boolean flag (a truthy non-true does not)", () => {
    expect(ProviderAccessSettingsService.parse({ providerAccess: { providerRemittanceV2: "yes" } }).providerRemittanceV2).toBe(false);
    expect(ProviderAccessSettingsService.parse({ providerAccess: { providerRemittanceV2: 1 } }).providerRemittanceV2).toBe(false);
  });
});

describe("ProviderAccessSettingsService.isRemittanceV2Enabled (F6.4 gate)", () => {
  it("is OFF by default", async () => {
    expect(await ProviderAccessSettingsService.isRemittanceV2Enabled("t1", "pA", fakeDb({}))).toBe(false);
  });
  it("is ON for every provider when the tenant-global flag is set", async () => {
    const db = fakeDb({ providerAccess: { providerRemittanceV2: true } });
    expect(await ProviderAccessSettingsService.isRemittanceV2Enabled("t1", "pA", db)).toBe(true);
    expect(await ProviderAccessSettingsService.isRemittanceV2Enabled("t1", "pZ", db)).toBe(true);
  });
  it("is ON only for allow-listed providers when the global flag is off", async () => {
    const db = fakeDb({ providerAccess: { providerRemittanceV2: false, remittanceV2ProviderIds: ["pA"] } });
    expect(await ProviderAccessSettingsService.isRemittanceV2Enabled("t1", "pA", db)).toBe(true);
    expect(await ProviderAccessSettingsService.isRemittanceV2Enabled("t1", "pB", db)).toBe(false);
  });
});

describe("ProviderAccessSettingsService — F7.3 contract-view flag", () => {
  it("parse reads providerContractView + filters non-string allow-list ids", () => {
    const s = ProviderAccessSettingsService.parse({
      providerAccess: { providerContractView: true, contractViewProviderIds: ["p1", 9, "p2", null] },
    });
    expect(s.providerContractView).toBe(true);
    expect(s.contractViewProviderIds).toEqual(["p1", "p2"]);
  });
  it("defaults OFF and only `=== true` enables it", () => {
    expect(PROVIDER_ACCESS_DEFAULTS.providerContractView).toBe(false);
    expect(ProviderAccessSettingsService.parse({ providerAccess: { providerContractView: "yes" } }).providerContractView).toBe(false);
    expect(ProviderAccessSettingsService.parse({ providerAccess: { providerContractView: 1 } }).providerContractView).toBe(false);
  });
  it("isContractViewEnabled: OFF by default, global-on, or per-provider allow-list", async () => {
    expect(await ProviderAccessSettingsService.isContractViewEnabled("t1", "pA", fakeDb({}))).toBe(false);
    expect(await ProviderAccessSettingsService.isContractViewEnabled("t1", "pZ", fakeDb({ providerAccess: { providerContractView: true } }))).toBe(true);
    const allow = fakeDb({ providerAccess: { providerContractView: false, contractViewProviderIds: ["pA"] } });
    expect(await ProviderAccessSettingsService.isContractViewEnabled("t1", "pA", allow)).toBe(true);
    expect(await ProviderAccessSettingsService.isContractViewEnabled("t1", "pB", allow)).toBe(false);
  });
  it("the remittance flag and the contract-view flag are independent", async () => {
    const db = fakeDb({ providerAccess: { providerRemittanceV2: true } });
    expect(await ProviderAccessSettingsService.isRemittanceV2Enabled("t1", "pA", db)).toBe(true);
    expect(await ProviderAccessSettingsService.isContractViewEnabled("t1", "pA", db)).toBe(false);
  });
});

describe("ProviderAccessSettingsService.isEntitlementEnforced (F1.11 gate, mirror)", () => {
  it("off by default; global or per-provider enables", async () => {
    expect(await ProviderAccessSettingsService.isEntitlementEnforced("t1", "pA", fakeDb({}))).toBe(false);
    expect(await ProviderAccessSettingsService.isEntitlementEnforced("t1", "pA", fakeDb({ providerAccess: { entitlementEnforcement: true } }))).toBe(true);
    expect(await ProviderAccessSettingsService.isEntitlementEnforced("t1", "pA", fakeDb({ providerAccess: { enforcedProviderIds: ["pA"] } }))).toBe(true);
  });
});
