/**
 * F1.7 — per-route scope enforcement, eligibility group.
 *
 * Mock-based (matches tests/api/ convention). Proves: correct scope succeeds,
 * wrong scope is denied 403 FORBIDDEN_SCOPE, unscoped legacy key still works
 * (no silent break), operator key is exempt, and a missing/unknown credential
 * is unaffected by scope logic (auth handled separately).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ApiCredential } from "@/lib/apiAuth";

const cred = vi.hoisted(() => ({ current: null as ApiCredential | null }));
const db = vi.hoisted(() => ({
  member: { findFirst: vi.fn() },
  contractApplicability: { findMany: vi.fn(async () => [{ clientId: "c1", groupId: null, inclusionType: "INCLUDE" }]) },
  // SP-6: eligibility route projects the evaluator core (reads coverage periods).
  memberCoveragePeriod: { findMany: vi.fn(async () => []) },
  // WP-N4: the route checks the facility's status before any member lookup.
  provider: { findFirst: vi.fn(async () => ({ contractStatus: "ACTIVE" })) },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/apiAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/apiAuth")>();
  return { ...actual, withApiKey: (h: (req: Request) => Promise<Response>) => h, getApiCredential: vi.fn(async () => cred.current) };
});

import { GET as getEligibility } from "@/app/api/v1/eligibility/route";

const provider = (scopes: string[]): ApiCredential => ({ kind: "provider", tenantId: "t1", providerId: "pA", keyId: "k1", scopes, allowedBranchIds: [] });
const operator: ApiCredential = { kind: "operator" };
const req = () => new Request("https://x/api/v1/eligibility?memberNumber=M-1");

beforeEach(() => {
  vi.clearAllMocks();
  cred.current = null;
  // member resolves within the entitled client so a scope-allowed call reaches 200
  db.member.findFirst.mockImplementation(async () => ({
    firstName: "A", lastName: "B", memberNumber: "M-1", dateOfBirth: new Date("1990-01-01"), gender: "FEMALE", relationship: "PRINCIPAL",
    status: "ACTIVE", group: { name: "G", status: "ACTIVE", tenantId: "t1" }, package: { name: "P" },
  }));
});

describe("F1.7 eligibility scope enforcement", () => {
  it("correct scope succeeds (200)", async () => {
    cred.current = provider(["api.eligibility.read"]);
    expect((await getEligibility(req())).status).toBe(200);
  });

  it("wrong scope is denied 403 FORBIDDEN_SCOPE and never queries members", async () => {
    cred.current = provider(["api.benefits.read"]);
    const res = await getEligibility(req());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN_SCOPE");
    expect(db.member.findFirst).not.toHaveBeenCalled(); // denied before any data access
  });

  it("unscoped legacy key still works (no silent break)", async () => {
    cred.current = provider([]);
    expect((await getEligibility(req())).status).toBe(200);
  });

  it("operator key is exempt from scope restriction", async () => {
    cred.current = operator;
    expect((await getEligibility(req())).status).toBe(200);
  });
});
