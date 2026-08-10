import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ApiCredential } from "@/lib/apiAuth";

/**
 * WP-N4 (N-014) — the B2B eligibility/benefits routes must not return a member
 * (or its PII) when the presented key belongs to a SUSPENDED/non-operational
 * facility. Operator keys carry no single provider, so the gate does not apply.
 */

const cred = vi.hoisted(() => ({ current: null as ApiCredential | null }));
const db = vi.hoisted(() => ({
  provider: { findFirst: vi.fn(async () => ({ contractStatus: "ACTIVE" })) },
  member: { findFirst: vi.fn(async () => ({
    id: "m1", memberNumber: "M-1", firstName: "A", lastName: "B", dateOfBirth: new Date("1990-01-01"), gender: "FEMALE",
    relationship: "PRINCIPAL", status: "ACTIVE", packageId: "pk1", packageVersionId: "pv1",
    group: { name: "G", status: "ACTIVE", tenantId: "t1", clientId: "c1", effectiveDate: new Date("2025-01-01"), renewalDate: new Date("2027-01-01"), client: { status: "ACTIVE" } },
    package: { name: "P" },
  })) },
  contractApplicability: { findMany: vi.fn(async () => [{ clientId: "c1", groupId: null, inclusionType: "INCLUDE" }]) },
  memberCoveragePeriod: { findMany: vi.fn(async () => []) },
  packageVersion: { findFirst: vi.fn(async () => ({ benefits: [] })) },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/apiAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/apiAuth")>();
  return { ...actual, withApiKey: (h: (req: Request) => Promise<Response>) => h, getApiCredential: vi.fn(async () => cred.current) };
});

import { GET as getEligibility } from "@/app/api/v1/eligibility/route";
import { GET as getBenefits } from "@/app/api/v1/benefits/route";

const provider: ApiCredential = { kind: "provider", tenantId: "t1", providerId: "pA", keyId: "k1", scopes: [], allowedBranchIds: [] };
const operator: ApiCredential = { kind: "operator" };
const eligReq = () => new Request("https://x/api/v1/eligibility?memberNumber=M-1");
const benReq = () => new Request("https://x/api/v1/benefits?memberNumber=M-1");

beforeEach(() => {
  vi.clearAllMocks();
  cred.current = provider;
  db.provider.findFirst.mockResolvedValue({ contractStatus: "ACTIVE" });
});

describe("GET /api/v1/eligibility — facility suspension gate", () => {
  it("returns 403 for a SUSPENDED facility and never looks up the member", async () => {
    db.provider.findFirst.mockResolvedValue({ contractStatus: "SUSPENDED" });
    const res = await getEligibility(eligReq());
    expect(res.status).toBe(403);
    expect(db.member.findFirst).not.toHaveBeenCalled();
  });

  it("proceeds for an ACTIVE facility", async () => {
    const res = await getEligibility(eligReq());
    expect(res.status).toBe(200);
  });

  it("does not gate an operator key on a single provider status", async () => {
    cred.current = operator;
    const res = await getEligibility(eligReq());
    expect(res.status).toBe(200);
    expect(db.provider.findFirst).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/benefits — facility suspension gate", () => {
  it("returns 403 for a SUSPENDED facility and never looks up the member", async () => {
    db.provider.findFirst.mockResolvedValue({ contractStatus: "SUSPENDED" });
    const res = await getBenefits(benReq());
    expect(res.status).toBe(403);
    expect(db.member.findFirst).not.toHaveBeenCalled();
  });

  it("proceeds for an ACTIVE facility", async () => {
    const res = await getBenefits(benReq());
    expect(res.status).toBe(200);
  });
});
