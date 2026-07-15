/**
 * BB2-DEF-01 / BB2-DEF-02 / OBS-A3 regression: POST /api/v1/claims must reject
 * invalid intake input with a 400 (never a 201 with bad money, never a raw 500),
 * and must normalise diagnoses to the canonical { code, description, isPrimary }
 * shape so the claim page renders them.
 *
 * The auth boundary (withApiKey / getApiCredential) is mocked to a valid
 * per-facility provider credential; prisma and the dynamically-imported intake
 * services are mocked so the route → validation → create path runs in isolation.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  member: { findFirst: vi.fn() },
  memberCoveragePeriod: { findMany: vi.fn(async () => []) },
  provider: { findFirst: vi.fn() },
  claim: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
  preAuthorization: { findFirst: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/apiAuth", () => ({
  withApiKey: (h: unknown) => h,
  getApiCredential: vi.fn(async () => ({
    kind: "provider",
    tenantId: "tenant-1",
    providerId: "provider-A",
    keyId: "k1",
  })),
  providerScopeWhere: () => ({}),
  operatorTenantWhere: () => ({}),
}));

vi.mock("@/server/services/claims.service", () => ({
  ClaimsService: { resolveClaimCurrency: vi.fn(async () => "UGX") },
}));
vi.mock("@/server/services/fraud.service", () => ({
  FraudService: { evaluateClaim: vi.fn(async () => undefined) },
}));
vi.mock("@/server/services/auto-adjudication.service", () => ({
  AutoAdjudicationService: { processIntake: vi.fn(async () => undefined) },
}));
vi.mock("@/server/services/system-actor.service", () => ({
  getSystemActorId: vi.fn(async () => "system-actor"),
}));

import { POST } from "@/app/api/v1/claims/route";

const validBody = () => ({
  memberNumber: "AVH-2024-00010",
  serviceType: "OUTPATIENT",
  dateOfService: "2026-07-01",
  diagnoses: ["I10"],
  lineItems: [{ description: "Consultation", quantity: 1, unitCost: 3500 }],
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("https://x/api/v1/claims", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.member.findFirst.mockResolvedValue({
    id: "member-1",
    tenantId: "tenant-1",
    status: "ACTIVE",
    group: { status: "ACTIVE" },
  });
  prismaMock.provider.findFirst.mockResolvedValue({
    id: "provider-A",
    tenantId: "tenant-1",
    contractStatus: "ACTIVE",
  });
  prismaMock.claim.findFirst.mockResolvedValue(null); // no idempotency/dup match
  prismaMock.claim.count.mockResolvedValue(0);
  prismaMock.claim.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "claim-1",
    claimNumber: data.claimNumber,
    status: "RECEIVED",
    billedAmount: data.billedAmount,
  }));
});

describe("POST /api/v1/claims — input validation (BB2-DEF-01/02)", () => {
  it("rejects a negative unitCost with 400 and does not create a claim", async () => {
    const res = await post({ ...validBody(), lineItems: [{ description: "X", quantity: 1, unitCost: -5000 }] });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(JSON.stringify(json)).toMatch(/unitCost/);
    expect(prismaMock.claim.create).not.toHaveBeenCalled();
  });

  it("rejects a zero unitCost with 400", async () => {
    const res = await post({ ...validBody(), lineItems: [{ description: "X", quantity: 1, unitCost: 0 }] });
    expect(res.status).toBe(400);
    expect(prismaMock.claim.create).not.toHaveBeenCalled();
  });

  it("rejects zero and fractional quantity with 400", async () => {
    const zero = await post({ ...validBody(), lineItems: [{ description: "X", quantity: 0, unitCost: 100 }] });
    expect(zero.status).toBe(400);
    const frac = await post({ ...validBody(), lineItems: [{ description: "X", quantity: 1.5, unitCost: 100 }] });
    expect(frac.status).toBe(400);
    expect(prismaMock.claim.create).not.toHaveBeenCalled();
  });

  it("rejects an empty lineItems array with 400", async () => {
    const res = await post({ ...validBody(), lineItems: [] });
    expect(res.status).toBe(400);
    expect(prismaMock.claim.create).not.toHaveBeenCalled();
  });

  it("rejects a wrong-shaped diagnosis object with 400 (not 500) — BB2-DEF-02", async () => {
    const res = await post({ ...validBody(), diagnoses: [{ notCode: "x" }] });
    expect(res.status).toBe(400);
    expect(prismaMock.claim.create).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400 'Invalid JSON body'", async () => {
    const res = await post("{ not json");
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid JSON body");
  });

  it("rejects an unknown serviceType with 400", async () => {
    const res = await post({ ...validBody(), serviceType: "BANANA" });
    expect(res.status).toBe(400);
    expect(prismaMock.claim.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/claims — diagnosis normalisation (OBS-A3)", () => {
  it("accepts a valid payload and normalises string diagnoses to the canonical shape", async () => {
    const res = await post(validBody());
    expect(res.status).toBe(201);
    expect(prismaMock.claim.create).toHaveBeenCalledTimes(1);
    const data = prismaMock.claim.create.mock.calls[0][0].data;
    expect(data.diagnoses).toEqual([{ code: "I10", description: "I10", isPrimary: true }]);
    expect(data.billedAmount).toBe(3500);
  });
});
