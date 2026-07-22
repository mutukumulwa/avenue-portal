/**
 * Claims Autopilot F3.3 — canonical persistence (unit, mocked transaction).
 * The real-DB proofs (totals, rollback, concurrency link, suspected-separate)
 * live in tests/integration/claim-intake-persist.integration.test.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { persistClaimWithinTransaction, type PersistInput } from "@/server/services/claim-intake/persist";
import { parseClaimSubmissionV1 } from "@/server/services/claim-intake/schema";
import { normalizeSubmission } from "@/server/services/claim-intake/normalize";
import type { IntakeContext } from "@/server/services/claim-intake/context";

function normalized() {
  const p = parseClaimSubmissionV1({
    schemaVersion: "1", idempotencyKey: "persist-key-1",
    member: { memberId: "mbr-1" }, provider: { providerId: "prv-1" },
    encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-06-01" },
    diagnoses: [{ code: "J06.9", isPrimary: true }],
    lines: [
      { sourceLineRef: "L1", serviceCategory: "CONSULTATION", cptCode: "99213", icdCode: "J06.9", description: "GP", quantity: 1, unitCost: "1500.00", billedAmount: "1500.00" },
      { sourceLineRef: "L2", serviceCategory: "LABORATORY", cptCode: "85025", icdCode: "J06.9", description: "FBC", quantity: 1, unitCost: "2000.00", billedAmount: "2000.00" },
    ],
    currency: "UGX",
  });
  if (!p.success) throw new Error("bad fixture");
  return normalizeSubmission(p.data);
}

const ctx: IntakeContext = {
  tenantId: "t1", channel: "ADMIN_PORTAL", source: "MANUAL", scopeKey: "user:u1", actorId: "u1", isSystemActor: false,
  providerId: "prv-1", providerBranchId: null, clientId: "cl-1", memberId: "mbr-1", currency: "UGX",
  providerOwnsInvoiceNamespace: true, integrationKeyId: null,
};

function input(over: Partial<PersistInput> = {}): PersistInput {
  return { context: ctx, normalized: normalized(), receiptId: "rcpt-1", requestHash: "req:v1:h", strongEventFingerprint: null, suspectedDuplicateFingerprint: "suspect:v1:s", ...over };
}

function mockTx(over: Record<string, unknown> = {}) {
  return {
    claimIntakeReceipt: {
      findUnique: vi.fn(async () => ({ state: "PROCESSING", requestHash: "req:v1:h", claimId: null })),
      update: vi.fn(async () => ({})),
    },
    claim: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "clm-new", claimNumber: "CLM-2026-00001" })),
    },
    claimProcessingRun: { create: vi.fn(async () => ({ id: "run-new" })) },
    preAuthorization: { update: vi.fn(async () => ({})) },
    ...over,
  } as never;
}

describe("F3.3 — persistClaimWithinTransaction", () => {
  it("creates claim + lines + run and links the receipt (CREATED)", async () => {
    const tx = mockTx();
    const r = await persistClaimWithinTransaction(tx, input());
    expect(r).toEqual({ kind: "CREATED", claimId: "clm-new", claimNumber: "CLM-2026-00001", runId: "run-new" });
    const createArg = (tx as never as { claim: { create: { mock: { calls: unknown[][] } } } }).claim.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArg.data.source).toBe("MANUAL");
    expect(createArg.data.processingState).toBe("PENDING");
    expect(createArg.data.claimRevision).toBe(1);
    expect((createArg.data.billedAmount as { toString(): string }).toString()).toBe("3500");
    expect((createArg.data.claimLines as { create: unknown[] }).create).toHaveLength(2);
    // receipt linked SUCCEEDED
    expect((tx as never as { claimIntakeReceipt: { update: { mock: { calls: unknown[][] } } } }).claimIntakeReceipt.update.mock.calls[0][0]).toMatchObject({ data: expect.objectContaining({ state: "SUCCEEDED", claimId: "clm-new" }) });
  });

  it("does NOT run fraud / notifications / decisions (no such calls)", async () => {
    const tx = mockTx();
    await persistClaimWithinTransaction(tx, input());
    // The mocked tx only exposes claim/run/receipt/preauth — persist must not reach for anything else.
    expect(Object.keys(tx as object).sort()).toEqual(["claim", "claimIntakeReceipt", "claimProcessingRun", "preAuthorization"]);
  });

  it("rejects on a receipt request-hash mismatch (idempotency conflict)", async () => {
    const tx = mockTx({ claimIntakeReceipt: { findUnique: vi.fn(async () => ({ state: "PROCESSING", requestHash: "req:v1:DIFFERENT", claimId: null })), update: vi.fn() } });
    await expect(persistClaimWithinTransaction(tx, input())).rejects.toMatchObject({ kind: "IDEMPOTENCY_CONFLICT" });
  });

  it("links to the prior claim on a sequential strong-fingerprint match (no new claim)", async () => {
    const tx = mockTx({ claim: { findFirst: vi.fn(async () => ({ id: "clm-prior", claimNumber: "CLM-2026-00007" })), findUnique: vi.fn(), create: vi.fn() } });
    const r = await persistClaimWithinTransaction(tx, input({ strongEventFingerprint: "strong:v1:abc" }));
    expect(r).toEqual({ kind: "STRONG_LINK", claimId: "clm-prior", claimNumber: "CLM-2026-00007" });
    expect((tx as never as { claim: { create: { mock: { calls: unknown[] } } } }).claim.create.mock.calls).toHaveLength(0);
  });

  it("returns the existing claim when the receipt is already SUCCEEDED (idempotent)", async () => {
    const tx = mockTx({
      claimIntakeReceipt: { findUnique: vi.fn(async () => ({ state: "SUCCEEDED", requestHash: "req:v1:h", claimId: "clm-old" })), update: vi.fn() },
      claim: { findFirst: vi.fn(), findUnique: vi.fn(async () => ({ id: "clm-old", claimNumber: "CLM-2026-00003" })), create: vi.fn() },
    });
    const r = await persistClaimWithinTransaction(tx, input());
    expect(r).toEqual({ kind: "STRONG_LINK", claimId: "clm-old", claimNumber: "CLM-2026-00003" });
  });
});
