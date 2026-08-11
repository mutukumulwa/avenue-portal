/**
 * F3.4 — B2B /api/v1/preauth adapter over PreauthIntakeService.
 *
 * Mock-based (tests/api/ convention). Proves: the route requires api.preauth.write
 * (scoped keys), derives PROVIDER_API context from the credential, resolves the
 * provider (code→id) and blocks provider-code spoofing, maps the payload to the
 * canonical command, and translates results to the versioned envelope + correct
 * HTTP status (201/200 replay, 404/403/422 rejects, 409 conflict). No direct
 * preAuthorization.create remains.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ApiCredential } from "@/lib/apiAuth";

const cred = vi.hoisted(() => ({ current: null as ApiCredential | null }));
const svc = vi.hoisted(() => ({ result: null as unknown, throwConflict: false, captured: null as unknown }));
const db = vi.hoisted(() => ({
  provider: { findFirst: vi.fn() },
  preAuthorization: { findUnique: vi.fn(async () => ({ preauthNumber: "PA-2026-00042", status: "SUBMITTED" })) },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/apiAuth", async (io) => {
  const actual = await io<typeof import("@/lib/apiAuth")>();
  return { ...actual, withApiKey: (h: (r: Request) => Promise<Response>) => h, getApiCredential: vi.fn(async () => cred.current) };
});
vi.mock("@/server/services/preauth-adjudication.service", () => ({ preauthAdjudicationService: { executeAutoDecision: vi.fn() } }));
vi.mock("@/server/services/system-actor.service", () => ({ getSystemActorId: vi.fn(async () => "sys") }));
vi.mock("@/server/services/preauth-intake/service", async (io) => {
  const actual = await io<typeof import("@/server/services/preauth-intake/service")>();
  return {
    ...actual,
    PreauthIntakeService: {
      submit: vi.fn(async (ctx: unknown, submission: unknown) => {
        svc.captured = { ctx, submission };
        if (svc.throwConflict) throw new actual.PreauthIntakeConflict("rcpt-conflict");
        return svc.result;
      }),
    },
  };
});

import { POST } from "@/app/api/v1/preauth/route";

const providerKey = (scopes: string[]): ApiCredential => ({ kind: "provider", tenantId: "t1", providerId: "pA", keyId: "k1", scopes, allowedBranchIds: [] });
const operator: ApiCredential = { kind: "operator", tenantId: "t1" };

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(new Request("https://x/api/v1/preauth", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
}
const validBody = { memberNumber: "ALP-1", benefitCategory: "OUTPATIENT", serviceType: "OUTPATIENT", diagnoses: ["J06.9"], estimatedCost: 1500 };

beforeEach(() => {
  vi.clearAllMocks();
  cred.current = null;
  svc.result = { receiptId: "r1", status: "ACCEPTED", replayed: false, preauthId: "pa1" };
  svc.throwConflict = false;
  svc.captured = null;
  db.provider.findFirst.mockResolvedValue({ id: "pA", tenantId: "t1", slade360ProviderId: "SLADE-A" });
  db.preAuthorization.findUnique.mockResolvedValue({ preauthNumber: "PA-2026-00042", status: "SUBMITTED" });
});

describe("F3.4 preauth route adapter", () => {
  it("accepted submission → 201 with legacy fields + receipt envelope; PROVIDER_API context derived from the key", async () => {
    cred.current = providerKey(["api.preauth.write"]);
    const res = await post(validBody);
    expect(res.status).toBe(201);
    const b = await res.json();
    expect(b).toMatchObject({ success: true, reference: "PA-2026-00042", status: "SUBMITTED", preauthId: "pa1" });
    expect(b.receipt).toMatchObject({ id: "r1", status: "ACCEPTED", replayed: false });
    expect(b.requestId).toBeTruthy();
    // context was derived server-side (channel + provider from the key, not the body)
    expect((svc.captured as { ctx: { channel: string; providerId: string; tenantId: string } }).ctx).toMatchObject({ channel: "PROVIDER_API", providerId: "pA", tenantId: "t1" });
  });

  it("a scoped key lacking api.preauth.write is 403 FORBIDDEN_SCOPE and never calls the service", async () => {
    cred.current = providerKey(["api.eligibility.read"]);
    const res = await post(validBody);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN_SCOPE");
    const { PreauthIntakeService } = await import("@/server/services/preauth-intake/service");
    expect(PreauthIntakeService.submit).not.toHaveBeenCalled();
  });

  it("an unscoped key is DENIED 403 FORBIDDEN_SCOPE (fail-closed, ELIG-GAP-009)", async () => {
    cred.current = providerKey([]);
    const res = await post(validBody);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN_SCOPE");
  });

  it("replay → 200; a member-not-found rejection → 404; a validation rejection → 422", async () => {
    cred.current = providerKey(["api.preauth.write"]);
    svc.result = { receiptId: "r1", status: "ACCEPTED", replayed: true, preauthId: "pa1" };
    expect((await post(validBody)).status).toBe(200);

    svc.result = { receiptId: "r2", status: "REJECTED", replayed: false, errors: [{ code: "MEMBER_NOT_FOUND", message: "no member" }] };
    expect((await post(validBody)).status).toBe(404);

    svc.result = { receiptId: "r3", status: "REJECTED", replayed: false, errors: [{ code: "MISSING_BENEFIT_CATEGORY", message: "benefit required" }] };
    const res = await post(validBody);
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("MISSING_BENEFIT_CATEGORY");
  });

  it("an idempotency conflict → 409", async () => {
    cred.current = providerKey(["api.preauth.write"]);
    svc.throwConflict = true;
    const res = await post(validBody);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("a provider key cannot spoof providerCode to another facility → 403", async () => {
    cred.current = providerKey(["api.preauth.write"]);
    // key resolves provider pA (slade SLADE-A) but body claims a different code
    const res = await post({ ...validBody, providerCode: "SLADE-OTHER" });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("PROVIDER_MISMATCH");
  });

  it("operator key resolves the provider from providerCode", async () => {
    cred.current = operator;
    db.provider.findFirst.mockResolvedValueOnce({ id: "pByCode", tenantId: "t9", slade360ProviderId: "SLADE-A" });
    const res = await post({ ...validBody, providerCode: "SLADE-A" });
    expect(res.status).toBe(201);
    expect((svc.captured as { ctx: { providerId: string; tenantId: string; actorType: string } }).ctx).toMatchObject({ providerId: "pByCode", tenantId: "t9", actorType: "SYSTEM" });
  });

  it("passes idempotency-key header + mapped diagnoses to the canonical command", async () => {
    cred.current = providerKey(["api.preauth.write"]);
    await post(validBody, { "idempotency-key": "IDEM-9" });
    const cap = svc.captured as { submission: { idempotencyKey: string; diagnoses: Array<{ icdCode?: string }> } };
    expect(cap.submission.idempotencyKey).toBe("IDEM-9");
    expect(cap.submission.diagnoses[0].icdCode).toBe("J06.9"); // string diagnosis mapped
  });
});
