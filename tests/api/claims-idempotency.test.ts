/**
 * F5.2 — POST /api/v1/claims idempotency contract (BB2-DEF-03 lineage).
 *
 *  - The LEGACY replay is retained: a resend carrying an externalRef that
 *    matches an existing claim from this facility returns the ORIGINAL claim
 *    (200, duplicate:true) — with or without an Idempotency-Key header, and
 *    across the migration boundary (old claims replay too).
 *  - A canonical same-key replay returns 200 with `replayed: true`.
 *  - Without a key and without a matching externalRef, a NEW submission is
 *    refused (422 IDEMPOTENCY_KEY_REQUIRED) — the 2-minute heuristic dup-block
 *    is retired in favour of real idempotency + DUPLICATE_REVIEW routing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  member: { findFirst: vi.fn() },
  provider: { findFirst: vi.fn() },
  claim: { findFirst: vi.fn(), findUnique: vi.fn() },
  preAuthorization: { findFirst: vi.fn() },
}));
const submitMock = vi.hoisted(() => vi.fn());
const inlineMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/apiAuth", () => ({
  withApiKey: (h: unknown) => h,
  getApiCredential: vi.fn(async () => ({ kind: "provider", tenantId: "tenant-1", providerId: "provider-A", keyId: "k1" })),
  providerScopeWhere: () => ({}),
  operatorTenantWhere: () => ({}),
}));
vi.mock("@/server/services/claim-intake/intake.service", () => ({
  ClaimIntakeService: { submit: submitMock },
}));
vi.mock("@/server/services/claim-intake", () => ({
  processAcceptedRunInline: inlineMock,
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
const KEY = { "idempotency-key": "hms-key-00000001" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.claim.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.claim.findUnique.mockReset().mockResolvedValue({ claimNumber: "CLM-2026-00001", status: "RECEIVED", billedAmount: 3500, processingState: "ROUTED" });
  submitMock.mockReset().mockResolvedValue({
    success: true, replayed: false, receiptId: "rcp-1", correlationId: "cor-1",
    claimId: "claim-1", claimNumber: "CLM-2026-00001", receiptState: "SUCCEEDED",
    processingState: "PENDING", outcome: "ACCEPTED",
  });
});

describe("POST /api/v1/claims — idempotency (F5.2)", () => {
  it("replays the original claim on a repeat externalRef — even WITHOUT a header (legacy retained)", async () => {
    prismaMock.claim.findFirst.mockResolvedValueOnce({ claimNumber: "CLM-2026-00042", status: "APPROVED", billedAmount: 3500 });
    const res = await post(body({ externalRef: "HMS-TXN-001" })); // no Idempotency-Key
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.duplicate).toBe(true);
    expect(json.replayed).toBe(true);
    expect(json.claimNumber).toBe("CLM-2026-00042");
    expect(submitMock).not.toHaveBeenCalled(); // no new claim path entered
    // the legacy pre-check is provider-scoped
    expect(prismaMock.claim.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: "tenant-1", providerId: "provider-A", externalRef: "HMS-TXN-001" });
  });

  it("a canonical same-key replay returns 200 with replayed:true and the original receipt", async () => {
    submitMock.mockResolvedValue({
      success: true, replayed: true, receiptId: "rcp-1", correlationId: "cor-1",
      claimId: "claim-1", claimNumber: "CLM-2026-00001", receiptState: "SUCCEEDED",
      processingState: "ROUTED", outcome: "REPLAYED",
    });
    const res = await post(body(), KEY);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, duplicate: true, replayed: true, claimNumber: "CLM-2026-00001", receiptId: "rcp-1" });
    expect(inlineMock).not.toHaveBeenCalled(); // a replay never re-processes
  });

  it("a NEW submission without a key and without a matching externalRef is refused (422)", async () => {
    const res = await post(body({ externalRef: "NEVER-SEEN" })); // pre-check misses
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("a fresh accepted claim returns 201 with receipt + processing state and is processed in-request", async () => {
    const res = await post(body({ externalRef: "HMS-TXN-777" }), KEY);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, claimNumber: "CLM-2026-00001", receiptId: "rcp-1", processingState: "ROUTED" });
    expect(json.duplicate).toBeUndefined();
    expect(inlineMock).toHaveBeenCalledWith("claim-1");
    // the externalRef rides into the canonical submission for fingerprint/continuity
    expect(submitMock.mock.calls[0][1]).toMatchObject({ externalClaimRef: "HMS-TXN-777" });
  });

  it("a mid-persist replay (receipt without a claim yet) returns 202 processing", async () => {
    submitMock.mockResolvedValue({
      success: true, replayed: true, receiptId: "rcp-1", correlationId: "cor-1",
      claimId: null, claimNumber: null, receiptState: "PROCESSING",
      processingState: null, outcome: "PROCESSING",
    });
    const res = await post(body(), KEY);
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, processing: true, receiptId: "rcp-1" });
  });
});
