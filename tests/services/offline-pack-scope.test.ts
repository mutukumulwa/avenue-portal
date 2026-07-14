/**
 * FG-C1 regression: the offline data pack roster must be scoped to the members
 * the facility is ENTITLED to (its contracted clients/groups), never the whole
 * tenant. `OfflinePackService.buildPayload` composes the same
 * ProviderEntitlementService.entitledMemberWhere fragment the B2B eligibility
 * API uses, so a facility's pack can never leak members of an unrelated client
 * (e.g. the self-funded NWSC scheme) or, with group-level applicability, of a
 * sibling group under a shared client (the N3 shape).
 *
 * The fake prisma below honours the entitlement `where` fragment the real
 * service builds (same matchMember evaluator as tests/api/provider-read-scope),
 * so route → service → where is exercised end-to-end.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

type MemberRow = {
  id: string;
  memberNumber: string;
  groupId: string;
  clientId: string; // resolved via group
  firstName: string;
  lastName: string;
  status: string;
  packageVersionId: string | null;
};

const CLIENT_DEFAULT = "client-default"; // holds Safaricom + KCB groups
const CLIENT_NWSC = "client-nwsc";
const GRP_SAF = "grp-saf";
const GRP_KCB = "grp-kcb";
const GRP_NWSC = "grp-nwsc";

const MEMBERS: MemberRow[] = [
  { id: "m-saf", memberNumber: "AVH-DEMO-SAF-0001-P", groupId: GRP_SAF, clientId: CLIENT_DEFAULT, firstName: "Amina", lastName: "Naliaka", status: "ACTIVE", packageVersionId: "pv1" },
  { id: "m-kcb", memberNumber: "AVH-2024-00010", groupId: GRP_KCB, clientId: CLIENT_DEFAULT, firstName: "Agnes", lastName: "Mwangi", status: "ACTIVE", packageVersionId: "pv1" },
  { id: "m-nwsc", memberNumber: "NWSC-2026-01768", groupId: GRP_NWSC, clientId: CLIENT_NWSC, firstName: "Mark", lastName: "Kato", status: "ACTIVE", packageVersionId: "pv2" },
];

// providerId -> ContractApplicability select-shape rows
const APPLICABILITY: Record<string, { clientId: string; groupId: string | null; inclusionType: "INCLUDE" | "EXCLUDE" }[]> = {
  "provider-A": [{ clientId: CLIENT_DEFAULT, groupId: null, inclusionType: "INCLUDE" }], // whole default client
  "provider-B": [{ clientId: CLIENT_NWSC, groupId: null, inclusionType: "INCLUDE" }], //    NWSC only
  "provider-C": [], //                                                                      no entitlement → deny all
  "provider-G": [{ clientId: CLIENT_DEFAULT, groupId: GRP_SAF, inclusionType: "INCLUDE" }], // Safaricom group only (N3)
};

// Minimal recursive evaluator for the Member where-fragments entitledMemberWhere
// produces: id (deny sentinel), groupId {in}, group.clientId {in}, AND/OR/NOT.
function matchMember(where: any, m: MemberRow): boolean {
  if (!where) return true;
  if (where.AND) return (where.AND as any[]).every((w) => matchMember(w, m));
  if (where.OR) return (where.OR as any[]).some((w) => matchMember(w, m));
  if (where.NOT) return !matchMember(where.NOT, m);
  if (where.id !== undefined && where.id !== m.id) return false; // deny-by-default sentinel
  if (where.groupId?.in && !where.groupId.in.includes(m.groupId)) return false;
  if (where.group?.clientId?.in && !where.group.clientId.in.includes(m.clientId)) return false;
  return true;
}

const db = vi.hoisted(() => ({
  provider: { findUnique: vi.fn() },
  contractApplicability: { findMany: vi.fn() },
  member: { findMany: vi.fn() },
  packageProviderEligibility: { findMany: vi.fn(async () => []) },
  benefitUsage: { findMany: vi.fn(async () => []) },
  providerTariff: { findMany: vi.fn(async () => []) },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { OfflinePackService } from "@/server/services/offline-pack.service";

const TENANT = "tenant-1";

beforeEach(() => {
  vi.clearAllMocks();
  db.provider.findUnique.mockImplementation(async ({ where }: any) => ({
    id: where.id,
    tenantId: TENANT,
    tier: null,
  }));
  db.contractApplicability.findMany.mockImplementation(async ({ where }: any) =>
    (APPLICABILITY[where.contract.providerId] ?? []).map((r) => ({ ...r })),
  );
  db.member.findMany.mockImplementation(async ({ where }: any) =>
    MEMBERS.filter((m) => matchMember(where, m)),
  );
});

const rosterNumbers = async (providerId: string) => {
  const pack = await OfflinePackService.buildPayload(TENANT, providerId);
  return pack.roster.map((r) => r.memberNumber).sort();
};

describe("OfflinePackService.buildPayload — entitlement scope (FG-C1)", () => {
  it("passes the entitlement fragment into the member query (AND-composed)", async () => {
    await OfflinePackService.buildPayload(TENANT, "provider-A");
    const where = db.member.findMany.mock.calls[0][0].where;
    expect(where.AND).toBeDefined();
    expect(where.AND[0]).toEqual({ tenantId: TENANT, status: "ACTIVE" });
    expect(where.AND[1]).toBeDefined(); // the entitledMemberWhere fragment
  });

  it("includes the entitled client's members and EXCLUDES an unrelated client (NWSC)", async () => {
    // provider-A is contracted to the default client (Safaricom + KCB), not NWSC.
    expect(await rosterNumbers("provider-A")).toEqual(["AVH-2024-00010", "AVH-DEMO-SAF-0001-P"]);
  });

  it("scopes the other direction: an NWSC provider does not get default-client members", async () => {
    expect(await rosterNumbers("provider-B")).toEqual(["NWSC-2026-01768"]);
  });

  it("denies by default when the provider has no active INCLUDE applicability", async () => {
    expect(await rosterNumbers("provider-C")).toEqual([]);
  });

  it("honours group-level applicability: Safaricom-only, not the KCB sibling (N3 shape)", async () => {
    expect(await rosterNumbers("provider-G")).toEqual(["AVH-DEMO-SAF-0001-P"]);
  });
});
