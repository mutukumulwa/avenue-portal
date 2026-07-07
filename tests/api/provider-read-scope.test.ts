/**
 * E2E-D02 regression: the provider-facing GET read endpoints must confine
 * results to the authenticated key's own scope.
 *
 *  - /api/v1/eligibility and /api/v1/benefits resolve members only within the
 *    clients the key's provider is contracted to (member of another client
 *    returns 404); a provider with no active INCLUDE applicability resolves
 *    nothing (deny-by-default).
 *  - /api/v1/claims returns a claim only when it belongs to the key's own
 *    facility (another facility's claim returns 404).
 *  - the operator/global key still spans the tenant (no confinement).
 *
 * Production clients are separated by Client/Group (single tenant), so member
 * scoping goes through ProviderEntitlementService (Provider → active contract →
 * ContractApplicability.clientId), not by tenantId. The fake prisma below
 * honours the entitlement `where` fragment the real service builds, so the
 * route → service → where path is exercised end-to-end.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ApiCredential } from "@/lib/apiAuth";

type MemberRow = {
  memberNumber: string;
  groupId: string;
  clientId: string; // resolved via group
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: string;
  relationship: string;
  status: string;
  packageId: string;
  group: { name: string; status: string; tenantId: string; clientId: string };
  package: { name: string };
};

const CLIENT_DEFAULT = "client-default"; // holds Safaricom + KCB groups
const CLIENT_NWSC = "client-nwsc";

const mkMember = (over: Partial<MemberRow> & Pick<MemberRow, "memberNumber" | "groupId" | "clientId">): MemberRow => ({
  firstName: "First",
  lastName: "Last",
  dateOfBirth: new Date("1980-01-01"),
  gender: "FEMALE",
  relationship: "PRINCIPAL",
  status: "ACTIVE",
  packageId: "pkg1",
  group: { name: "Grp", status: "ACTIVE", tenantId: "tenant-1", clientId: over.clientId },
  package: { name: "Gold" },
  ...over,
});

const MEMBERS: MemberRow[] = [
  mkMember({ memberNumber: "AVH-DEMO-SAF-0023-S", groupId: "grp-saf", clientId: CLIENT_DEFAULT, firstName: "Amina", lastName: "Naliaka", dateOfBirth: new Date("1977-03-03") }),
  mkMember({ memberNumber: "AVH-2024-00010", groupId: "grp-kcb", clientId: CLIENT_DEFAULT, firstName: "Agnes", lastName: "Mwangi", dateOfBirth: new Date("1983-04-14") }),
  mkMember({ memberNumber: "NWSC-2026-01768", groupId: "grp-nwsc", clientId: CLIENT_NWSC, firstName: "Mark", lastName: "Kato" }),
];

// providerId -> applicability rows (as ContractApplicability select shape)
const APPLICABILITY: Record<string, { clientId: string; groupId: string | null; inclusionType: "INCLUDE" | "EXCLUDE" }[]> = {
  "provider-A": [{ clientId: CLIENT_DEFAULT, groupId: null, inclusionType: "INCLUDE" }], // Aga Khan → default client
  "provider-B": [{ clientId: CLIENT_NWSC, groupId: null, inclusionType: "INCLUDE" }], //    NWSC-only provider
  "provider-C": [], //                                                                     no entitlement → deny all
};

const CLAIM_A = {
  claimNumber: "CLM-2026-00288",
  providerId: "provider-A",
  status: "RECEIVED",
  billedAmount: 3500,
  approvedAmount: 0,
  copayAmount: 0,
  dateOfService: new Date("2026-07-07"),
  createdAt: new Date("2026-07-07T09:00:00Z"),
  member: { memberNumber: "NWSC-2026-01768", firstName: "Mark", lastName: "Kato" },
  provider: { name: "Aga Khan University Hospital" },
};
const CLAIM_B = { ...CLAIM_A, claimNumber: "CLM-2026-00284", providerId: "provider-B", provider: { name: "IHK" } };
const CLAIMS = [CLAIM_A, CLAIM_B];

// Minimal recursive evaluator for the Member where-fragments this code path
// produces: memberNumber, id, groupId {in}, group.clientId {in}, AND/OR/NOT.
function matchMember(where: any, m: MemberRow): boolean {
  if (!where) return true;
  if (where.AND) return (where.AND as any[]).every((w) => matchMember(w, m));
  if (where.OR) return (where.OR as any[]).some((w) => matchMember(w, m));
  if (where.NOT) return !matchMember(where.NOT, m);
  if (where.memberNumber !== undefined && where.memberNumber !== m.memberNumber) return false;
  if (where.id !== undefined && where.id !== (m as any).id) return false; // deny-by-default sentinel
  if (where.groupId?.in && !where.groupId.in.includes(m.groupId)) return false;
  if (where.group?.clientId?.in && !where.group.clientId.in.includes(m.clientId)) return false;
  return true;
}

const db = vi.hoisted(() => ({
  member: {
    findFirst: vi.fn(),
  },
  contractApplicability: {
    findMany: vi.fn(),
  },
  claim: {
    findFirst: vi.fn(),
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
import { ProviderEntitlementService } from "@/server/services/provider-entitlement.service";

const provider = (id: string): ApiCredential => ({ kind: "provider", tenantId: "tenant-1", providerId: id, keyId: `k-${id}` });
const operator: ApiCredential = { kind: "operator" };

const eligibilityReq = (n: string) => new Request(`https://x/api/v1/eligibility?memberNumber=${n}`);
const benefitsReq = (n: string) => new Request(`https://x/api/v1/benefits?memberNumber=${n}`);
const claimReq = (n: string) => new Request(`https://x/api/v1/claims?claimNumber=${n}`);

beforeEach(() => {
  vi.clearAllMocks();
  cred.current = null;
  db.member.findFirst.mockImplementation(async ({ where }: any) => MEMBERS.find((m) => matchMember(where, m)) ?? null);
  db.contractApplicability.findMany.mockImplementation(async ({ where }: any) => {
    const rows = APPLICABILITY[where.contract.providerId] ?? [];
    return rows.map((r) => ({ ...r }));
  });
  db.claim.findFirst.mockImplementation(async ({ where }: any) => {
    const c = CLAIMS.find((x) => x.claimNumber === where.claimNumber);
    if (!c) return null;
    if (where.providerId !== undefined && where.providerId !== c.providerId) return null;
    return c;
  });
});

describe("GET /api/v1/eligibility client-entitlement scope (E2E-D02)", () => {
  it("resolves a member of a client the provider is contracted to", async () => {
    cred.current = provider("provider-A"); // entitled to default client (Safaricom + KCB)
    const res = await getEligibility(eligibilityReq("AVH-DEMO-SAF-0023-S"));
    expect(res.status).toBe(200);
    expect((await res.json()).member.memberNumber).toBe("AVH-DEMO-SAF-0023-S");
  });

  it("returns 404 for a member of a client the provider is NOT contracted to (no PII leak)", async () => {
    cred.current = provider("provider-A"); // NOT entitled to NWSC
    const res = await getEligibility(eligibilityReq("NWSC-2026-01768"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Member not found");
    expect(body.member).toBeUndefined();
  });

  it("scopes the other direction too: NWSC provider cannot read a default-client member", async () => {
    cred.current = provider("provider-B");
    expect((await getEligibility(eligibilityReq("AVH-DEMO-SAF-0023-S"))).status).toBe(404);
    expect((await getEligibility(eligibilityReq("NWSC-2026-01768"))).status).toBe(200);
  });

  it("denies by default when the provider has no active INCLUDE applicability", async () => {
    cred.current = provider("provider-C");
    expect((await getEligibility(eligibilityReq("AVH-DEMO-SAF-0023-S"))).status).toBe(404);
  });

  it("lets the operator key span all clients", async () => {
    cred.current = operator;
    expect((await getEligibility(eligibilityReq("NWSC-2026-01768"))).status).toBe(200);
  });
});

describe("GET /api/v1/benefits client-entitlement scope (E2E-D02)", () => {
  it("returns 404 for a member outside the provider's contracted clients", async () => {
    cred.current = provider("provider-A");
    const res = await getBenefits(benefitsReq("NWSC-2026-01768"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Member not found");
  });

  it("resolves a member of a contracted client", async () => {
    cred.current = provider("provider-A");
    expect((await getBenefits(benefitsReq("AVH-DEMO-SAF-0023-S"))).status).toBe(200);
  });
});

describe("GET /api/v1/claims facility scope (E2E-D02)", () => {
  it("returns a claim belonging to the key's own facility", async () => {
    cred.current = provider("provider-A");
    const res = await getClaim(claimReq("CLM-2026-00288"));
    expect(res.status).toBe(200);
    expect((await res.json()).claimNumber).toBe("CLM-2026-00288");
  });

  it("returns 404 for another facility's claim", async () => {
    cred.current = provider("provider-A");
    const res = await getClaim(claimReq("CLM-2026-00284"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Claim not found");
    expect(body.member).toBeUndefined();
  });

  it("lets the operator key read across facilities", async () => {
    cred.current = operator;
    expect((await getClaim(claimReq("CLM-2026-00284"))).status).toBe(200);
  });
});

describe("ProviderEntitlementService.entitledMemberWhere", () => {
  it("builds a client allow-list from INCLUDE rows", async () => {
    db.contractApplicability.findMany.mockResolvedValueOnce([{ clientId: "c1", groupId: null, inclusionType: "INCLUDE" }]);
    const where = await ProviderEntitlementService.entitledMemberWhere("p1");
    expect(where).toEqual({ group: { clientId: { in: ["c1"] } } });
  });

  it("denies everything when there are no INCLUDE rows", async () => {
    db.contractApplicability.findMany.mockResolvedValueOnce([]);
    const where = await ProviderEntitlementService.entitledMemberWhere("p1");
    expect(where).toEqual({ id: "__no_provider_entitlement__" });
  });

  it("honours group-level INCLUDE and subtracts EXCLUDE rows", async () => {
    db.contractApplicability.findMany.mockResolvedValueOnce([
      { clientId: "c1", groupId: null, inclusionType: "INCLUDE" },
      { clientId: "cX", groupId: "gX", inclusionType: "INCLUDE" },
      { clientId: "cE", groupId: null, inclusionType: "EXCLUDE" },
    ]);
    const where = await ProviderEntitlementService.entitledMemberWhere("p1");
    expect(where).toEqual({
      AND: [
        { OR: [{ group: { clientId: { in: ["c1"] } } }, { groupId: { in: ["gX"] } }] },
        { NOT: { OR: [{ group: { clientId: { in: ["cE"] } } }] } },
      ],
    });
  });
});
