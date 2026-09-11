/**
 * Family Hospital UAT plan P02.04 step 5 / P04.03 — the pre-auth intake stores
 * the SERVER-built capture provenance (selected tariff, contracted unit rate,
 * currency) with each procedure, includes it in the request hash, and never
 * takes those fields from the untrusted payload. Mock db, real intake.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PreauthCallerContext, PreauthSubmissionV1 } from "@/server/services/preauth-intake/contract";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/provider-entitlement.service", () => ({ ProviderEntitlementService: { entitledMemberWhere: vi.fn(async () => ({})) } }));
vi.mock("@/server/services/benefit-usage.service", () => ({ BenefitUsageService: { resolveConfig: vi.fn(async () => ({ id: "bc1" })) } }));

import { PreauthIntakeService } from "@/server/services/preauth-intake/service";
import { normalizePreauth, preauthRequestHash, withProcedureProvenance } from "@/server/services/preauth-intake/contract";

const stored = vi.hoisted(() => ({ pa: null as null | Record<string, unknown>, receipt: null as null | Record<string, unknown> }));

function mockDb() {
  const tx = {
    preAuthorization: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => { stored.pa = args.data; return { id: "pa-1" }; }),
    },
    preauthIntakeReceipt: { create: vi.fn(async (args: { data: Record<string, unknown> }) => { stored.receipt = args.data; return { id: "r-1" }; }) },
    preAuthorizationEvent: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
  };
  return {
    preauthIntakeReceipt: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({ id: "r-rej" })), update: vi.fn(async () => ({})) },
    member: { findFirst: vi.fn(async () => ({ id: "mem-1", status: "ACTIVE", groupId: "g1", group: { clientId: "c1" } })) },
    provider: { findFirst: vi.fn(async () => ({ contractStatus: "ACTIVE" })) },
    preAuthorizationEvent: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
}

const ctx: PreauthCallerContext = { channel: "PROVIDER_PORTAL", tenantId: "t1", providerId: "prov-1", providerBranchId: "br-1", actorType: "USER", actorId: "u1" };
const submission: PreauthSubmissionV1 = {
  memberId: "mem-1",
  serviceType: "DAY_CASE",
  benefitCategory: "SURGICAL",
  expectedDateOfService: "2026-09-20",
  diagnoses: [{ icdCode: "L72.0", description: "Epidermal cyst", isPrimary: true }],
  procedures: [
    // A caller trying to smuggle a rate and a tariff id in the payload:
    { description: "Excision of lesion (less than 5 lesions)", quantity: 1, unitCost: "600000", total: "600000", selectedProviderTariffId: "t-FORGED", contractedUnitRate: "1" } as never,
  ],
  estimatedCost: "600000",
  idempotencyKey: "op_draft-00000001",
};
const provenance = [{ selectedProviderTariffId: "t-exc", contractedUnitRate: "270000", currency: "UGX" }];
const deps = { adjudicate: vi.fn(async () => undefined) };

beforeEach(() => {
  vi.clearAllMocks();
  stored.pa = null;
  stored.receipt = null;
});

describe("pre-auth intake — server-built procedure provenance", () => {
  it("stores the trusted provenance with the procedure, and the estimate as exact decimals", async () => {
    const res = await PreauthIntakeService.submit(ctx, submission, deps, mockDb() as never, { procedureProvenance: provenance });
    expect(res).toMatchObject({ status: "ACCEPTED", preauthId: "pa-1" });
    expect(stored.pa?.procedures).toEqual([
      { cptCode: null, description: "Excision of lesion (less than 5 lesions)", quantity: 1, unitCost: "600000.00", total: "600000.00", selectedProviderTariffId: "t-exc", contractedUnitRate: "270000", currency: "UGX" },
    ]);
    expect(stored.pa?.estimatedCost).toBe("600000.00");
    expect(stored.receipt).toMatchObject({ providerBranchId: "br-1", status: "PROCESSING" });
  });

  it("never takes provenance from the payload: without the trusted argument none is stored", async () => {
    await PreauthIntakeService.submit(ctx, submission, deps, mockDb() as never);
    const proc = (stored.pa?.procedures as Array<Record<string, unknown>>)[0];
    expect(proc).not.toHaveProperty("selectedProviderTariffId");
    expect(proc).not.toHaveProperty("contractedUnitRate");
  });

  it("the provenance is part of the request hash — the same payload for another tariff is another request", () => {
    const n = normalizePreauth(submission).normalized;
    const a = preauthRequestHash(ctx, withProcedureProvenance(n, provenance));
    const b = preauthRequestHash(ctx, withProcedureProvenance(n, [{ ...provenance[0], selectedProviderTariffId: "t-other" }]));
    expect(a).not.toBe(b);
  });

  it("provenance that does not match the procedures is refused", () => {
    const n = normalizePreauth(submission).normalized;
    expect(() => withProcedureProvenance(n, [])).toThrow(/does not match/);
  });
});
