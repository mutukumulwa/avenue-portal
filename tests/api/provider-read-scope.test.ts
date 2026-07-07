/**
 * E2E-D02 regression: the provider-facing GET read endpoints must confine
 * results to the authenticated key's own scope.
 *
 *  - /api/v1/eligibility and /api/v1/benefits resolve members only within the
 *    key's tenant (a cross-tenant member number returns 404).
 *  - /api/v1/claims returns a claim only when it belongs to the key's own
 *    facility (another facility's claim returns 404).
 *  - the operator/global key still spans the tenant (no confinement).
 *
 * The auth wrapper itself (garbage key -> 401) is exercised by the real
 * apiAuth module; here we mock getApiCredential to drive the resolved scope and
 * keep the real tenantScopeWhere / providerScopeWhere (the logic under test).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ApiCredential } from "@/lib/apiAuth";

// A single seeded member / claim, each owned by tenant A / facility A.
const MEMBER_A = {
  memberNumber: "AVH-DEMO-SAF-0023-S",
  tenantId: "tenant-A",
  firstName: "Amina",
  lastName: "Naliaka",
  dateOfBirth: new Date("1977-03-03"),
  gender: "FEMALE",
  relationship: "SPOUSE",
  status: "ACTIVE",
  group: { name: "Safaricom", status: "ACTIVE", tenantId: "tenant-A" },
  package: { name: "Gold" },
};

const CLAIM_A = {
  claimNumber: "CLM-2026-00284",
  providerId: "provider-A",
  status: "APPROVED",
  billedAmount: 14000,
  approvedAmount: 6000,
  copayAmount: 0,
  dateOfService: new Date("2026-07-01"),
  createdAt: new Date("2026-07-01T09:00:00Z"),
  member: { memberNumber: "AVH-2026-01", firstName: "Prossy", lastName: "Kato" },
  provider: { name: "IHK" },
};

// Fake prisma that honours the scope fragment the handler applies. A record is
// returned only when the where-clause scope matches its owner — exactly how a
// real DB filter behaves.
const db = vi.hoisted(() => ({
  member: {
    findFirst: vi.fn(async ({ where }: { where: { memberNumber?: string; tenantId?: string } }) => {
      if (where.memberNumber !== MEMBER_A.memberNumber) return null;
      if (where.tenantId !== undefined && where.tenantId !== MEMBER_A.tenantId) return null;
      return MEMBER_A;
    }),
  },
  claim: {
    findFirst: vi.fn(async ({ where }: { where: { claimNumber?: string; providerId?: string } }) => {
      if (where.claimNumber !== CLAIM_A.claimNumber) return null;
      if (where.providerId !== undefined && where.providerId !== CLAIM_A.providerId) return null;
      return CLAIM_A;
    }),
  },
  packageVersion: { findFirst: vi.fn(async () => ({ benefits: [] })) },
  benefitUsage: { findMany: vi.fn(async () => []) },
}));

const cred = vi.hoisted(() => ({ current: null as ApiCredential | null }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

vi.mock("@/lib/apiAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/apiAuth")>();
  return {
    ...actual,
    withApiKey: (h: (req: Request, ...a: unknown[]) => Promise<Response>) => h,
    getApiCredential: vi.fn(async () => cred.current),
  };
});

import { GET as getEligibility } from "@/app/api/v1/eligibility/route";
import { GET as getBenefits } from "@/app/api/v1/benefits/route";
import { GET as getClaim } from "@/app/api/v1/claims/route";

const providerA: ApiCredential = { kind: "provider", tenantId: "tenant-A", providerId: "provider-A", keyId: "k-A" };
const providerB: ApiCredential = { kind: "provider", tenantId: "tenant-B", providerId: "provider-B", keyId: "k-B" };
const operator: ApiCredential = { kind: "operator" };

const eligibilityReq = () => new Request(`https://x/api/v1/eligibility?memberNumber=${MEMBER_A.memberNumber}`);
const benefitsReq = () => new Request(`https://x/api/v1/benefits?memberNumber=${MEMBER_A.memberNumber}`);
const claimReq = () => new Request(`https://x/api/v1/claims?claimNumber=${CLAIM_A.claimNumber}`);

beforeEach(() => {
  vi.clearAllMocks();
  cred.current = null;
});

describe("GET /api/v1/eligibility tenant scope (E2E-D02)", () => {
  it("resolves a member inside the key's own tenant", async () => {
    cred.current = providerA;
    const res = await getEligibility(eligibilityReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.member.memberNumber).toBe(MEMBER_A.memberNumber);
  });

  it("returns 404 for a member outside the key's tenant (no PII leak)", async () => {
    cred.current = providerB;
    const res = await getEligibility(eligibilityReq());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Member not found");
    expect(body.member).toBeUndefined();
  });

  it("lets the operator key span the tenant", async () => {
    cred.current = operator;
    const res = await getEligibility(eligibilityReq());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/benefits tenant scope (E2E-D02)", () => {
  it("returns 404 for a member outside the key's tenant", async () => {
    cred.current = providerB;
    const res = await getBenefits(benefitsReq());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Member not found");
  });

  it("resolves a member inside the key's own tenant", async () => {
    cred.current = providerA;
    const res = await getBenefits(benefitsReq());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/claims facility scope (E2E-D02)", () => {
  it("returns a claim belonging to the key's own facility", async () => {
    cred.current = providerA;
    const res = await getClaim(claimReq());
    expect(res.status).toBe(200);
    expect((await res.json()).claimNumber).toBe(CLAIM_A.claimNumber);
  });

  it("returns 404 for another facility's claim", async () => {
    cred.current = providerB;
    const res = await getClaim(claimReq());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Claim not found");
    expect(body.member).toBeUndefined();
  });

  it("lets the operator key read across facilities", async () => {
    cred.current = operator;
    const res = await getClaim(claimReq());
    expect(res.status).toBe(200);
  });
});
