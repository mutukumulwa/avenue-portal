/**
 * F5.2 — POST /api/v1/claims adapter contract (validation + mapping + D12).
 *
 * The route is an adapter over the canonical ClaimIntakeService: structural
 * failures return 422 with field issues (§8.6 — BB2-DEF-01/02 upgraded from
 * 400), invalid JSON stays 400, and the legacy body shape maps onto
 * ClaimSubmissionV1 (diagnoses normalized to exactly one primary, lines stamped
 * with the primary ICD, benefitCategory defaulting to OUTPATIENT). A facility
 * key may not name another facility (403); an unbound operator key may not
 * submit (403). Canonical errors map: 409 IDEMPOTENCY_KEY_REUSED, 403 scope.
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
const credentialMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/apiAuth", () => ({
  withApiKey: (h: unknown) => h,
  getApiCredential: credentialMock,
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
import { IntakeError } from "@/server/services/claim-intake/errors";

const providerCredential = { kind: "provider", tenantId: "tenant-1", providerId: "provider-A", keyId: "k1" };

const validBody = () => ({
  memberNumber: "AVH-2024-00010",
  serviceType: "OUTPATIENT",
  dateOfService: "2026-07-01",
  diagnoses: ["I10"],
  lineItems: [{ description: "Consultation", quantity: 1, unitCost: 3500 }],
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("https://x/api/v1/claims", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const KEY = { "idempotency-key": "hms-key-00000001" };

beforeEach(() => {
  vi.clearAllMocks();
  credentialMock.mockResolvedValue(providerCredential);
  prismaMock.claim.findFirst.mockResolvedValue(null); // no legacy externalRef replay
  prismaMock.claim.findUnique.mockResolvedValue({ claimNumber: "CLM-2026-00001", status: "RECEIVED", billedAmount: 3500, processingState: "ROUTED" });
  submitMock.mockResolvedValue({
    success: true, replayed: false, receiptId: "rcp-1", correlationId: "cor-1",
    claimId: "claim-1", claimNumber: "CLM-2026-00001", receiptState: "SUCCEEDED",
    processingState: "PENDING", outcome: "ACCEPTED",
  });
});

describe("POST /api/v1/claims — structural validation (§8.6: 422)", () => {
  it.each([
    ["negative unitCost", { lineItems: [{ description: "X", quantity: 1, unitCost: -5000 }] }, /unitCost/],
    ["zero unitCost", { lineItems: [{ description: "X", quantity: 1, unitCost: 0 }] }, /unitCost/],
    ["zero quantity", { lineItems: [{ description: "X", quantity: 0, unitCost: 100 }] }, /quantity/],
    ["fractional quantity", { lineItems: [{ description: "X", quantity: 1.5, unitCost: 100 }] }, /quantity/],
    ["empty lineItems", { lineItems: [] }, /line item/],
    ["wrong-shaped diagnosis (BB2-DEF-02)", { diagnoses: [{ notCode: "x" }] }, /./],
    ["unknown serviceType", { serviceType: "BANANA" }, /./],
  ])("rejects %s with 422 and never submits", async (_n, over, msg) => {
    const res = await post({ ...validBody(), ...over }, KEY);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_FAILED");
    expect(JSON.stringify(json)).toMatch(msg);
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400 'Invalid JSON body'", async () => {
    const res = await post("{ not json", KEY);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON body");
  });

  it("requires the Idempotency-Key header for a NEW submission (422, stable code)", async () => {
    const res = await post(validBody()); // no header
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(submitMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/claims — canonical mapping", () => {
  it("maps the legacy body onto ClaimSubmissionV1 (201 + receipt fields)", async () => {
    const res = await post(
      { ...validBody(), diagnoses: ["I10", { code: "E11.9", description: "T2DM" }] },
      KEY,
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, claimNumber: "CLM-2026-00001", receiptId: "rcp-1", correlationId: "cor-1" });

    expect(submitMock).toHaveBeenCalledTimes(1);
    const [identity, submission] = submitMock.mock.calls[0];
    expect(identity).toMatchObject({ kind: "providerKey", tenantId: "tenant-1", providerId: "provider-A", keyId: "k1" });
    expect(submission).toMatchObject({
      schemaVersion: "1",
      idempotencyKey: "hms-key-00000001",
      member: { memberNumber: "AVH-2024-00010" },
      encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-07-01" },
    });
    // Diagnoses: exactly one primary (first, by legacy default), canonical shape.
    expect(submission.diagnoses).toEqual([
      { code: "I10", description: "I10", isPrimary: true },
      { code: "E11.9", description: "T2DM", isPrimary: false },
    ]);
    // Lines: primary ICD stamped, billed recomputed, category defaulted.
    expect(submission.lines).toEqual([
      { serviceCategory: "OTHER", icdCode: "I10", description: "Consultation", quantity: 1, unitCost: 3500, billedAmount: 3500 },
    ]);
    expect(inlineMock).toHaveBeenCalledWith("claim-1"); // D9 in-request decision
  });

  it("a facility key naming ANOTHER facility's providerCode is rejected (D12, 403)", async () => {
    prismaMock.provider.findFirst.mockResolvedValue({ id: "provider-B" }); // code resolves to a different facility
    const res = await post({ ...validBody(), providerCode: "SLADE-B" }, KEY);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/does not match the authenticated provider/i);
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("an unbound operator key cannot submit claims (403)", async () => {
    credentialMock.mockResolvedValue({ kind: "operator" }); // no tenant binding
    const res = await post({ ...validBody(), providerCode: "SLADE-A" }, KEY);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/tenant-bound/i);
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("maps canonical scope errors to non-enumerating 403", async () => {
    submitMock.mockRejectedValue(IntakeError.authorization("Member is not accessible to this caller."));
    const res = await post(validBody(), KEY);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/not accessible/i);
  });

  it("maps a same-key different-payload conflict to 409 IDEMPOTENCY_KEY_REUSED", async () => {
    submitMock.mockRejectedValue(IntakeError.idempotencyConflict("rcp-original"));
    const res = await post(validBody(), KEY);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(json.originalReceiptRef).toBe("rcp-original");
  });
});
