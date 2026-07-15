/**
 * BB2-DEF-03 regression: the B2B claims API must be idempotent.
 *
 *  - A retry carrying the same externalRef (body field OR Idempotency-Key header)
 *    returns the ORIGINAL claim (200, duplicate:true) instead of creating a
 *    second payable claim.
 *  - Without an idempotency key, an identical claim within a 2-minute window is
 *    blocked with 409 (matching the provider-portal BD-02 guard); outside the
 *    window it proceeds.
 *  - A concurrent retry that races past the pre-check and hits the unique index
 *    (P2002) is resolved as an idempotent replay, not a 500.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";

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

const body = (over: Record<string, unknown> = {}) => ({
  memberNumber: "AVH-2024-00010",
  serviceType: "OUTPATIENT",
  dateOfService: "2026-07-01",
  diagnoses: ["I10"],
  lineItems: [{ description: "Consultation", quantity: 1, unitCost: 3500 }],
  ...over,
});

const post = (b: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("https://x/api/v1/claims", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(b),
    }),
  );

let created = 0;

beforeEach(() => {
  vi.clearAllMocks();
  created = 0;
  // mockReset() (not just clear) flushes any leftover mockResolvedValueOnce
  // queue from a prior test before re-establishing the default.
  prismaMock.member.findFirst.mockReset().mockResolvedValue({
    id: "member-1",
    tenantId: "tenant-1",
    status: "ACTIVE",
    group: { status: "ACTIVE" },
  });
  prismaMock.provider.findFirst.mockReset().mockResolvedValue({
    id: "provider-A",
    tenantId: "tenant-1",
    contractStatus: "ACTIVE",
  });
  prismaMock.claim.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.claim.count.mockReset().mockImplementation(async () => created);
  prismaMock.claim.create.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    created += 1;
    return {
      id: `claim-${created}`,
      claimNumber: data.claimNumber,
      status: "RECEIVED",
      billedAmount: data.billedAmount,
    };
  });
});

describe("POST /api/v1/claims — idempotency (BB2-DEF-03)", () => {
  it("replays the original claim on a repeat externalRef (body field)", async () => {
    const first = await post(body({ externalRef: "HMS-TXN-001" }));
    expect(first.status).toBe(201);
    const firstJson = await first.json();
    expect(prismaMock.claim.create).toHaveBeenCalledTimes(1);

    // Second call: the idempotency pre-check now finds the original claim.
    prismaMock.claim.findFirst.mockResolvedValueOnce({
      claimNumber: firstJson.claimNumber,
      status: "RECEIVED",
      billedAmount: 3500,
    });
    const second = await post(body({ externalRef: "HMS-TXN-001" }));
    expect(second.status).toBe(200);
    const secondJson = await second.json();
    expect(secondJson.duplicate).toBe(true);
    expect(secondJson.claimNumber).toBe(firstJson.claimNumber);
    expect(prismaMock.claim.create).toHaveBeenCalledTimes(1); // no second create
  });

  it("replays on a repeat Idempotency-Key header (no body field)", async () => {
    prismaMock.claim.findFirst.mockResolvedValueOnce({
      claimNumber: "CLM-2026-00001",
      status: "RECEIVED",
      billedAmount: 3500,
    });
    const res = await post(body(), { "idempotency-key": "HDR-1" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.duplicate).toBe(true);
    expect(prismaMock.claim.create).not.toHaveBeenCalled();
  });

  it("blocks an identical claim within the 2-minute window with 409 (no key)", async () => {
    // Without a key the idempotency pre-check is skipped, so the ONLY findFirst
    // call is the duplicate-window query — return a recent match.
    prismaMock.claim.findFirst.mockResolvedValueOnce({ claimNumber: "CLM-2026-00050" });
    const res = await post(body());
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.claimNumber).toBe("CLM-2026-00050");
    expect(prismaMock.claim.create).not.toHaveBeenCalled();
  });

  it("proceeds when the only prior claim is outside the 2-minute window", async () => {
    // recentDuplicate query returns null (older claims excluded by the where clause).
    prismaMock.claim.findFirst.mockResolvedValue(null);
    const res = await post(body());
    expect(res.status).toBe(201);
    expect(prismaMock.claim.create).toHaveBeenCalledTimes(1);
  });

  it("resolves a P2002 race as a replay (200), not a 500", async () => {
    prismaMock.claim.findFirst
      .mockResolvedValueOnce(null) // idem pre-check misses
      .mockResolvedValueOnce(null) // duplicate-window misses
      .mockResolvedValueOnce({ claimNumber: "CLM-2026-00099", status: "RECEIVED", billedAmount: 3500 }); // post-P2002 lookup
    prismaMock.claim.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "x",
      }),
    );
    const res = await post(body({ externalRef: "RACE-1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.duplicate).toBe(true);
    expect(json.claimNumber).toBe("CLM-2026-00099");
  });
});
