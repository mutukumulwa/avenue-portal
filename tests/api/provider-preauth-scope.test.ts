/**
 * E2E-D02 sibling: the provider-facing POST /api/v1/preauth create path must be
 * confined to the authenticated per-facility key's own scope, mirroring
 * POST /api/v1/claims:
 *
 *  - a per-facility key derives the provider from the key (a spoofed
 *    providerCode in the body is ignored), so a pre-auth can only ever be
 *    attributed to the key's own facility;
 *  - the resolved member must belong to the same tenant as the key's provider —
 *    a member of another tenant is rejected with 403 (no cross-tenant filing);
 *  - the operator key still resolves the provider from providerCode.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ApiCredential } from "@/lib/apiAuth";

type MemberRow = { id: string; memberNumber: string; tenantId: string; status: string };
type ProviderRow = { id: string; slade360ProviderId: string; tenantId: string };

const MEMBERS: MemberRow[] = [
  { id: "mem-A", memberNumber: "TEN-A-0001", tenantId: "tenant-A", status: "ACTIVE" },
  { id: "mem-B", memberNumber: "TEN-B-0001", tenantId: "tenant-B", status: "ACTIVE" },
];

const PROVIDERS: ProviderRow[] = [
  { id: "provider-A", slade360ProviderId: "SLADE-A", tenantId: "tenant-A" },
  { id: "provider-B", slade360ProviderId: "SLADE-B", tenantId: "tenant-B" },
];

const db = vi.hoisted(() => ({
  member: { findFirst: vi.fn() },
  provider: { findFirst: vi.fn() },
  preAuthorization: { count: vi.fn(), create: vi.fn() },
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

import { POST as postPreAuth } from "@/app/api/v1/preauth/route";

const provider = (id: string, tenantId: string): ApiCredential => ({ kind: "provider", tenantId, providerId: id, keyId: `k-${id}` });
const operator: ApiCredential = { kind: "operator" };

const preauthReq = (body: Record<string, unknown>) =>
  new Request("https://x/api/v1/preauth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const validBody = (over: Record<string, unknown> = {}) => ({
  memberNumber: "TEN-A-0001",
  providerCode: "SLADE-A",
  benefitCategory: "OUTPATIENT",
  diagnoses: ["A00"],
  estimatedCost: 1000,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  cred.current = null;
  db.member.findFirst.mockImplementation(async ({ where }: any) => MEMBERS.find((m) => m.memberNumber === where.memberNumber) ?? null);
  db.provider.findFirst.mockImplementation(async ({ where }: any) =>
    PROVIDERS.find((p) => (where.id !== undefined ? p.id === where.id : p.slade360ProviderId === where.slade360ProviderId)) ?? null
  );
  db.preAuthorization.count.mockResolvedValue(0);
  db.preAuthorization.create.mockImplementation(async ({ data }: any) => ({ ...data, preauthNumber: data.preauthNumber, status: data.status }));
});

describe("POST /api/v1/preauth facility scope (E2E-D02 sibling)", () => {
  it("lets a facility file a pre-auth for its own tenant's member", async () => {
    cred.current = provider("provider-A", "tenant-A");
    const res = await postPreAuth(preauthReq(validBody()));
    expect(res.status).toBe(201);
    const created = db.preAuthorization.create.mock.calls[0][0].data;
    expect(created.providerId).toBe("provider-A");
    expect(created.tenantId).toBe("tenant-A");
  });

  it("rejects filing a pre-auth for another tenant's member (403)", async () => {
    cred.current = provider("provider-A", "tenant-A");
    const res = await postPreAuth(preauthReq(validBody({ memberNumber: "TEN-B-0001" })));
    expect(res.status).toBe(403);
    expect(db.preAuthorization.create).not.toHaveBeenCalled();
  });

  it("ignores a spoofed providerCode and attributes the pre-auth to the key's facility", async () => {
    cred.current = provider("provider-A", "tenant-A");
    // Facility A presents facility B's provider code — it must be overridden.
    const res = await postPreAuth(preauthReq(validBody({ providerCode: "SLADE-B" })));
    expect(res.status).toBe(201);
    expect(db.preAuthorization.create.mock.calls[0][0].data.providerId).toBe("provider-A");
  });

  it("still resolves the provider from providerCode for the operator key", async () => {
    cred.current = operator;
    const res = await postPreAuth(preauthReq(validBody({ memberNumber: "TEN-B-0001", providerCode: "SLADE-B" })));
    expect(res.status).toBe(201);
    expect(db.preAuthorization.create.mock.calls[0][0].data.providerId).toBe("provider-B");
  });
});
