/**
 * E2E-D04 regression — updated for F3.4 (route now delegates to
 * PreauthIntakeService). The route still enforces at its own seam:
 *  - a per-facility key attributes the PA to its OWN provider; a spoofed
 *    `providerCode` for another facility is rejected (403) and the service is
 *    never called;
 *  - a matching/redundant `providerCode` is harmless — the key's provider wins;
 *  - the operator key resolves the provider from `providerCode`;
 *  - a member outside entitlement / cross-tenant resolves to a SAFE not-found
 *    (404, no PII); an inactive member keeps a safe denial (403).
 *
 * The ACTUAL entitlement/tenant/active enforcement now lives in
 * PreauthIntakeService and is proven against a real DB + real entitlement in
 * tests/services/preauth-intake-service.test.ts (F3.3). Here we mock the service
 * to assert the ROUTE contract: context derivation, spoof block, and the
 * rejection→HTTP mapping that preserves the E2E-D04 safe-denial behaviour.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ApiCredential } from "@/lib/apiAuth";
import { PROVIDER_API_SCOPES } from "@/lib/provider-api-scopes";

const cred = vi.hoisted(() => ({ current: null as ApiCredential | null }));
const svc = vi.hoisted(() => ({ result: null as unknown, captured: null as unknown }));
const db = vi.hoisted(() => ({
  provider: { findFirst: vi.fn() },
  preAuthorization: { findUnique: vi.fn(async () => ({ preauthNumber: "PA-2026-1", status: "SUBMITTED" })) },
}));

const PROVIDERS: Record<string, { id: string; slade360ProviderId: string; tenantId: string }> = {
  "provider-A": { id: "provider-A", slade360ProviderId: "AGA-KHAN", tenantId: "tenant-1" },
  "provider-B": { id: "provider-B", slade360ProviderId: "IHK", tenantId: "tenant-1" },
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/apiAuth", async (io) => {
  const actual = await io<typeof import("@/lib/apiAuth")>();
  return { ...actual, withApiKey: (h: (r: Request) => Promise<Response>) => h, getApiCredential: vi.fn(async () => cred.current) };
});
vi.mock("@/server/services/preauth-adjudication.service", () => ({ preauthAdjudicationService: { executeAutoDecision: vi.fn() } }));
vi.mock("@/server/services/system-actor.service", () => ({ getSystemActorId: vi.fn(async () => "sys") }));
vi.mock("@/server/services/preauth-intake/service", async (io) => {
  const actual = await io<typeof import("@/server/services/preauth-intake/service")>();
  return { ...actual, PreauthIntakeService: { submit: vi.fn(async (ctx: unknown, submission: unknown) => { svc.captured = { ctx, submission }; return svc.result; }) } };
});

import { POST as postPreauth } from "@/app/api/v1/preauth/route";

const provider = (id: string): ApiCredential => ({ kind: "provider", tenantId: "tenant-1", providerId: id, keyId: `k-${id}`, scopes: [...PROVIDER_API_SCOPES], allowedBranchIds: [] });
const operator: ApiCredential = { kind: "operator", tenantId: "tenant-1" };
const req = (body: Record<string, unknown>) => new Request("https://x/api/v1/preauth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const validBody = (over: Record<string, unknown> = {}) => ({ memberNumber: "AVH-DEMO-SAF-0023-S", benefitCategory: "OUTPATIENT", diagnoses: ["A00"], estimatedCost: 5000, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  cred.current = null;
  svc.result = { receiptId: "r1", status: "ACCEPTED", replayed: false, preauthId: "pa1" };
  svc.captured = null;
  db.provider.findFirst.mockImplementation(async ({ where }: { where: { id?: string; slade360ProviderId?: string } }) =>
    Object.values(PROVIDERS).find((x) => (where.id ? x.id === where.id : x.slade360ProviderId === where.slade360ProviderId)) ?? null);
});

describe("POST /api/v1/preauth key-scoped create (E2E-D04, post-F3.4)", () => {
  it("attributes the PA to the key's own provider (context derived server-side)", async () => {
    cred.current = provider("provider-A");
    const res = await postPreauth(req(validBody()));
    expect(res.status).toBe(201);
    expect((svc.captured as { ctx: { providerId: string; channel: string } }).ctx).toMatchObject({ providerId: "provider-A", channel: "PROVIDER_API" });
  });

  it("rejects a spoofed providerCode for another facility (403) and never calls the service", async () => {
    cred.current = provider("provider-A");
    const res = await postPreauth(req(validBody({ providerCode: "IHK" })));
    expect(res.status).toBe(403);
    const { PreauthIntakeService } = await import("@/server/services/preauth-intake/service");
    expect(PreauthIntakeService.submit).not.toHaveBeenCalled();
  });

  it("ignores a redundant matching providerCode and still uses the key's provider", async () => {
    cred.current = provider("provider-A");
    const res = await postPreauth(req(validBody({ providerCode: "AGA-KHAN" })));
    expect(res.status).toBe(201);
    expect((svc.captured as { ctx: { providerId: string } }).ctx.providerId).toBe("provider-A");
  });

  it("a member outside entitlement / cross-tenant is a SAFE not-found (404, no PII)", async () => {
    cred.current = provider("provider-A");
    svc.result = { receiptId: "r2", status: "REJECTED", replayed: false, errors: [{ code: "MEMBER_NOT_FOUND", message: "No eligible member found" }] };
    const res = await postPreauth(req(validBody({ memberNumber: "NWSC-2026-01768" })));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/tenant-|client-|groupId/); // no internal identifiers leaked
  });

  it("keeps the inactive-member safe denial (403)", async () => {
    cred.current = provider("provider-B");
    svc.result = { receiptId: "r3", status: "REJECTED", replayed: false, errors: [{ code: "MEMBER_NOT_ACTIVE", message: "Member is not active" }] };
    expect((await postPreauth(req(validBody({ memberNumber: "NWSC-2026-09999" })))).status).toBe(403);
  });

  it("lets the operator key resolve the provider from providerCode", async () => {
    cred.current = operator;
    const res = await postPreauth(req(validBody({ providerCode: "AGA-KHAN" })));
    expect(res.status).toBe(201);
    expect((svc.captured as { ctx: { providerId: string; actorType: string } }).ctx).toMatchObject({ providerId: "provider-A", actorType: "SYSTEM" });
  });

  it("404s when neither a provider key nor a resolvable providerCode is present", async () => {
    cred.current = operator; // operator with no providerCode → no provider resolved
    const res = await postPreauth(req(validBody()));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("PROVIDER_NOT_FOUND");
  });
});
