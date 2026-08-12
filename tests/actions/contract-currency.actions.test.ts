/**
 * UAT-HF P02.04 — DEF-052: contract creation defaulted to a literal "KES" on a
 * Uganda deployment.
 *
 * It was not one bug in one place. The same wrong assumption was copied into
 * four: the form (`defaultValue="KES"`), the create action (`?? "KES"`), the
 * import action (`|| "KES"`) and the Prisma schema (`@default("KES")`). That is
 * what "no single source of truth" costs.
 *
 * Acceptance: "Uganda tenant creates UGX contract; genuine KES contract remains
 * KES only when explicitly selected and audited."
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireRole = vi.hoisted(() => vi.fn(async () => ({ user: { id: "uw-1", tenantId: "t1" } })));
vi.mock("@/lib/rbac", () => ({ requireRole, ROLES: { UNDERWRITING: ["UNDERWRITER"] } }));

const db = vi.hoisted(() => ({
  provider: { findUnique: vi.fn(async () => ({ id: "prov-1", tenantId: "t1" })) },
  providerContract: { create: vi.fn(async (_a: MockDbArgs) => ({ id: "contract-1" })) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const redirect = vi.hoisted(() =>
  vi.fn((url: string): never => {
    const e = new Error("NEXT_REDIRECT") as Error & { url: string };
    e.url = url;
    throw e;
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

const tenantCurrency = vi.hoisted(() => ({ value: "UGX" as string | null }));
vi.mock("@/server/services/tenant-settings.service", () => ({
  TenantSettingsService: {
    getDefaultCurrency: vi.fn(async () => tenantCurrency.value),
    parseDefaultCurrency: vi.fn(),
  },
}));

vi.mock("@/server/services/provider-contracts.service", () => ({
  ProviderContractsService: { nextContractNumber: vi.fn(async () => "PC-2026-999") },
}));
vi.mock("@/server/services/contract-lifecycle.service", () => ({ ContractLifecycleService: {} }));

import { createContractAction } from "@/app/(admin)/contracts/actions";

const VALID = {
  providerId: "prov-1",
  title: "Nile Metropolitan rate schedule",
  startDate: "2026-08-11",
  endDate: "2027-08-10",
};

async function run(fields: Record<string, string>): Promise<string> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  try {
    await createContractAction(fd);
  } catch (e) {
    const url = (e as { url?: string }).url;
    if (url) return url;
    throw e;
  }
  throw new Error("action did not redirect");
}

const writtenCurrency = () =>
  (db.providerContract.create.mock.calls[0][0].data as Record<string, unknown>).currency;

beforeEach(() => {
  vi.clearAllMocks();
  tenantCurrency.value = "UGX";
});

describe("P02.04 contract currency — DEF-052", () => {
  it("a Uganda tenant creates a UGX contract, with no KES anywhere", async () => {
    await run(VALID);
    expect(writtenCurrency()).toBe("UGX");
    expect(JSON.stringify(db.providerContract.create.mock.calls[0][0])).not.toContain("KES");
  });

  it("keeps a genuinely foreign currency when it is EXPLICITLY selected", async () => {
    // The other half of the acceptance: a real cross-border agreement must still
    // be possible — the fix is removing the silent default, not banning KES.
    await run({ ...VALID, currency: "KES" });
    expect(writtenCurrency()).toBe("KES");
  });

  it("normalises the selected code", async () => {
    await run({ ...VALID, currency: "usd" });
    expect(writtenCurrency()).toBe("USD");
  });

  it("REFUSES to guess when the tenant has no configured currency", async () => {
    tenantCurrency.value = null;
    const url = await run(VALID);
    // Money whose denomination was invented is worse than money with none.
    expect(db.providerContract.create).not.toHaveBeenCalled();
    expect(decodeURIComponent(url)).toMatch(/select a currency/i);
  });

  it("still accepts an explicit choice when the tenant has no default", async () => {
    tenantCurrency.value = null;
    await run({ ...VALID, currency: "UGX" });
    expect(writtenCurrency()).toBe("UGX");
  });

  it("never falls back to KES, whatever the tenant config says", async () => {
    for (const configured of [null, "UGX", "USD"]) {
      vi.clearAllMocks();
      tenantCurrency.value = configured;
      try {
        await run(VALID);
      } catch {
        /* the null case redirects without writing */
      }
      if (db.providerContract.create.mock.calls.length > 0) {
        expect(writtenCurrency()).toBe(configured);
      }
    }
  });
});
