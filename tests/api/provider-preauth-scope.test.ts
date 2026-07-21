/**
 * E2E-D04 regression: the provider-facing POST /api/v1/preauth write endpoint
 * must be scoped to the authenticated key, mirroring the safe POST-claim path.
 *
 *  - a per-facility key attributes the pre-auth to its OWN provider; a spoofed
 *    `providerCode` for another facility is rejected (403) and never overrides
 *    the key.
 *  - the member must belong to a client the key's provider is contracted to
 *    (ProviderEntitlementService); an out-of-scope member returns 404 with no
 *    PII, and NO preAuthorization row is written.
 *  - a member in a different tenant than the resolved provider is rejected (403).
 *  - the operator key may resolve the provider from `providerCode`.
 *  - inactive members keep the existing safe denial.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ApiCredential } from "@/lib/apiAuth";

type MemberRow = {
  id: string;
  memberNumber: string;
  groupId: string;
  clientId: string;
  tenantId: string;
  status: string;
};

const CLIENT_DEFAULT = "client-default";
const CLIENT_NWSC = "client-nwsc";

const MEMBERS: MemberRow[] = [
  { id: "m-amina", memberNumber: "AVH-DEMO-SAF-0023-S", groupId: "grp-saf", clientId: CLIENT_DEFAULT, tenantId: "tenant-1", status: "ACTIVE" },
  { id: "m-mark", memberNumber: "NWSC-2026-01768", groupId: "grp-nwsc", clientId: CLIENT_NWSC, tenantId: "tenant-1", status: "ACTIVE" },
  { id: "m-inactive", memberNumber: "NWSC-2026-09999", groupId: "grp-nwsc", clientId: CLIENT_NWSC, tenantId: "tenant-1", status: "SUSPENDED" },
  { id: "m-other-tenant", memberNumber: "OT-2026-00001", groupId: "grp-ot", clientId: CLIENT_NWSC, tenantId: "tenant-2", status: "ACTIVE" },
];

// providerId -> { record, applicability }
const PROVIDERS: Record<string, { id: string; slade360ProviderId: string; tenantId: string }> = {
  "provider-A": { id: "provider-A", slade360ProviderId: "AGA-KHAN", tenantId: "tenant-1" }, // default client
  "provider-B": { id: "provider-B", slade360ProviderId: "IHK", tenantId: "tenant-1" }, //       NWSC-only
};

const APPLICABILITY: Record<string, { clientId: string; groupId: string | null; inclusionType: "INCLUDE" | "EXCLUDE" }[]> = {
  "provider-A": [{ clientId: CLIENT_DEFAULT, groupId: null, inclusionType: "INCLUDE" }],
  "provider-B": [{ clientId: CLIENT_NWSC, groupId: null, inclusionType: "INCLUDE" }],
};

function matchMember(where: any, m: MemberRow): boolean {
  if (!where) return true;
  if (where.AND) return (where.AND as any[]).every((w) => matchMember(w, m));
  if (where.OR) return (where.OR as any[]).some((w) => matchMember(w, m));
  if (where.NOT) return !matchMember(where.NOT, m);
  if (where.memberNumber !== undefined && where.memberNumber !== m.memberNumber) return false;
  if (where.id !== undefined && where.id !== m.id) return false; // deny-by-default sentinel
  if (where.groupId?.in && !where.groupId.in.includes(m.groupId)) return false;
  if (where.group?.clientId?.in && !where.group.clientId.in.includes(m.clientId)) return false;
  return true;
}

const db = vi.hoisted(() => ({
  member: { findFirst: vi.fn() },
  provider: { findFirst: vi.fn() },
  contractApplicability: { findMany: vi.fn() },
  preAuthorization: { count: vi.fn(async () => 0), findFirst: vi.fn(async () => null), create: vi.fn(async ({ data }: any) => ({ ...data })) },
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

import { POST as postPreauth } from "@/app/api/v1/preauth/route";

const provider = (id: string): ApiCredential => ({ kind: "provider", tenantId: "tenant-1", providerId: id, keyId: `k-${id}` });
const operator: ApiCredential = { kind: "operator" };

const preauthReq = (body: Record<string, unknown>) =>
  new Request("https://x/api/v1/preauth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const validBody = (over: Record<string, unknown> = {}) => ({
  memberNumber: "AVH-DEMO-SAF-0023-S",
  benefitCategory: "OUTPATIENT",
  diagnoses: ["A00"],
  estimatedCost: 5000,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  cred.current = null;
  db.member.findFirst.mockImplementation(async ({ where }: any) => MEMBERS.find((m) => matchMember(where, m)) ?? null);
  db.provider.findFirst.mockImplementation(async ({ where }: any) => {
    const p = Object.values(PROVIDERS).find(
      (x) => (where.id ? x.id === where.id : x.slade360ProviderId === where.slade360ProviderId),
    );
    return p ?? null;
  });
  db.contractApplicability.findMany.mockImplementation(async ({ where }: any) =>
    (APPLICABILITY[where.contract.providerId] ?? []).map((r) => ({ ...r })),
  );
  db.preAuthorization.count.mockResolvedValue(0);
});

describe("POST /api/v1/preauth key-scoped create (E2E-D04)", () => {
  it("creates a pre-auth for an entitled active member at the key's own facility", async () => {
    cred.current = provider("provider-A"); // entitled to default client (Amina)
    const res = await postPreauth(preauthReq(validBody()));
    expect(res.status).toBe(201);
    const created = db.preAuthorization.create.mock.calls[0][0].data;
    expect(created.providerId).toBe("provider-A");
    expect(created.memberId).toBe("m-amina");
    expect(created.tenantId).toBe("tenant-1");
  });

  it("rejects a spoofed providerCode for another facility (403), writes nothing", async () => {
    cred.current = provider("provider-A");
    const res = await postPreauth(preauthReq(validBody({ providerCode: "IHK" })));
    expect(res.status).toBe(403);
    expect(db.preAuthorization.create).not.toHaveBeenCalled();
  });

  it("ignores a redundant matching providerCode and still uses the key's provider", async () => {
    cred.current = provider("provider-A");
    const res = await postPreauth(preauthReq(validBody({ providerCode: "AGA-KHAN" })));
    expect(res.status).toBe(201);
    expect(db.preAuthorization.create.mock.calls[0][0].data.providerId).toBe("provider-A");
  });

  it("returns 404 for a member outside the provider's entitlement, writes nothing (no PII)", async () => {
    cred.current = provider("provider-A"); // NOT entitled to NWSC
    const res = await postPreauth(preauthReq(validBody({ memberNumber: "NWSC-2026-01768" })));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Member not found");
    expect(db.preAuthorization.create).not.toHaveBeenCalled();
  });

  it("blocks a cross-tenant member (403)", async () => {
    // provider-B is NWSC-entitled; the other-tenant member is in CLIENT_NWSC so
    // it passes entitlement but belongs to tenant-2 → same-tenant guard rejects.
    cred.current = provider("provider-B");
    const res = await postPreauth(preauthReq(validBody({ memberNumber: "OT-2026-00001" })));
    expect(res.status).toBe(403);
    expect(db.preAuthorization.create).not.toHaveBeenCalled();
  });

  it("keeps the inactive-member safe denial (403)", async () => {
    cred.current = provider("provider-B");
    const res = await postPreauth(preauthReq(validBody({ memberNumber: "NWSC-2026-09999" })));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Member is not active");
    expect(db.preAuthorization.create).not.toHaveBeenCalled();
  });

  it("lets the operator key resolve the provider from providerCode", async () => {
    cred.current = operator;
    const res = await postPreauth(preauthReq(validBody({ providerCode: "AGA-KHAN" })));
    expect(res.status).toBe(201);
    expect(db.preAuthorization.create.mock.calls[0][0].data.providerId).toBe("provider-A");
  });

  it("400s when neither a provider key nor a providerCode is present", async () => {
    cred.current = operator;
    const res = await postPreauth(preauthReq(validBody()));
    expect(res.status).toBe(400);
  });
});
