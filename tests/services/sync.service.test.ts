import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  syncOperation: {
    findUnique: vi.fn(),
    create: vi.fn(async (a: any) => ({ id: "op_" + a.data.opKey })),
    update: vi.fn(async () => ({ tenantId: "t1", opKey: "k1", entityType: "Claim" })),
  },
  member: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(async (): Promise<any[]> => []) },
  provider: { findFirst: vi.fn() },
  benefitConfig: { findFirst: vi.fn(async (): Promise<any> => null) },
  benefitUsage: { findMany: vi.fn(async (): Promise<any[]> => []), findUnique: vi.fn(async (): Promise<any> => null) },
  benefitConfigSharedLimit: { findMany: vi.fn(async (): Promise<any[]> => []) },
  benefitHold: { findMany: vi.fn(async (): Promise<any[]> => []) },
  claim: { findFirst: vi.fn(async (): Promise<any> => null), count: vi.fn(async () => 0), create: vi.fn(async () => ({ id: "clm1" })) },
  // PR-036: CONFLICT ops land in the Exception Register; work-code path
  // resolves the provider from the issuing authorization.
  exceptionLog: { create: vi.fn(async () => ({})) },
  offlineWorkAuthorization: { findUnique: vi.fn(async (): Promise<any> => null) },
}));

const submitMock = vi.hoisted(() => vi.fn());
const inlineMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/system-actor.service", () => ({ getSystemActorId: vi.fn(async () => "sys-user-1") }));
vi.mock("@/server/services/claim-intake/intake.service", () => ({ ClaimIntakeService: { submit: submitMock } }));
vi.mock("@/server/services/claim-intake", () => ({ processAcceptedRunInline: inlineMock }));

import { SyncService } from "@/server/services/sync.service";
import { IntakeError } from "@/server/services/claim-intake/errors";

const op = (over: any = {}) => ({
  clientUuid: "uuid1",
  opKey: "k1",
  entityType: "Claim",
  payload: { a: 1 },
  capturedAt: "2026-07-01T00:00:00Z",
  ...over,
});

describe("SyncService — store-and-forward (G4)", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("ingest", () => {
    it("buffers a new operation", async () => {
      db.syncOperation.findUnique.mockResolvedValue(null);
      const res = await SyncService.ingest("t1", [op()]);
      expect(res[0].duplicate).toBe(false);
      expect(db.syncOperation.create).toHaveBeenCalled();
    });

    it("is idempotent — a seen opKey is not re-inserted", async () => {
      db.syncOperation.findUnique.mockResolvedValue({ id: "existing" });
      const res = await SyncService.ingest("t1", [op()]);
      expect(res[0]).toEqual({ opKey: "k1", id: "existing", duplicate: true });
      expect(db.syncOperation.create).not.toHaveBeenCalled();
    });
  });

  describe("reconcile", () => {
    it("marks a well-formed PENDING op SYNCED", async () => {
      db.syncOperation.findUnique.mockResolvedValue({ id: "o1", state: "PENDING", payload: { a: 1 } });
      const res = await SyncService.reconcile("o1");
      expect(res.state).toBe("SYNCED");
      expect(db.syncOperation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ state: "SYNCED" }) }),
      );
    });

    it("flags a malformed payload as CONFLICT (never silently dropped)", async () => {
      db.syncOperation.findUnique.mockResolvedValue({ id: "o2", state: "PENDING", payload: null });
      const res = await SyncService.reconcile("o2");
      expect(res.state).toBe("CONFLICT");
    });

    it("is a no-op on an already-reconciled op (idempotency drop)", async () => {
      db.syncOperation.findUnique.mockResolvedValue({ id: "o3", state: "SYNCED", payload: {} });
      const res = await SyncService.reconcile("o3");
      expect(res.state).toBe("SYNCED");
      expect(db.syncOperation.update).not.toHaveBeenCalled();
    });
  });

  describe("reconcile — Claim via canonical intake (F5.5)", () => {
    const fullPayload = (over: any = {}) => ({
      memberNumber: "MVX-2026-00001", providerCode: "SLD-001", serviceType: "OUTPATIENT",
      lineItems: [{ description: "Consult", quantity: 1, unitCost: 50000 }], ...over,
    });
    const claimOp = (payload: any) => ({ id: "c1", tenantId: "t1", clientUuid: "uuid-1", opKey: "op-key-1", deviceId: "dev-9", offlineAuthId: null, state: "PENDING", entityType: "Claim", payload });

    beforeEach(() => {
      db.member.findFirst.mockResolvedValue({ id: "m1" });
      db.provider.findFirst.mockResolvedValue({ id: "p1" });
      db.claim.findFirst.mockResolvedValue(null);
      db.benefitUsage.findMany.mockResolvedValue([]);
      db.member.findUnique.mockResolvedValue({ packageVersionId: "pv1", enrollmentDate: new Date("2026-01-15") });
      db.benefitConfig.findFirst.mockResolvedValue({ id: "cfg-out", annualSubLimit: 1_000_000 });
      db.benefitUsage.findUnique.mockResolvedValue(null);
      submitMock.mockResolvedValue({
        success: true, replayed: false, receiptId: "rcp-1", correlationId: "cor-1",
        claimId: "clm-1", claimNumber: "CLM-2026-00001", receiptState: "SUCCEEDED",
        processingState: "PENDING", outcome: "ACCEPTED",
      });
    });

    it("CONFLICTs when the offline reservation can no longer be honoured (canonical benefit service)", async () => {
      db.syncOperation.findUnique.mockResolvedValue(claimOp(fullPayload({ lineItems: [{ description: "X", quantity: 1, unitCost: 200000 }] })));
      // OUTPATIENT availability = 100000 − 20000 − 0 = 80000 < 200000 billed
      db.benefitConfig.findFirst.mockResolvedValue({ id: "cfg-out", annualSubLimit: 100000 });
      db.benefitUsage.findUnique.mockResolvedValue({ amountUsed: 20000, activeHoldAmount: 0 });
      const res = await SyncService.reconcile("c1");
      expect(res.state).toBe("CONFLICT");
      expect(res.reason).toMatch(/BENEFIT_CATEGORY_EXHAUSTED[\s\S]*Insufficient benefit at sync time/i);
      expect(submitMock).not.toHaveBeenCalled();
    });

    it("SYNCs a clean capture through the canonical service: opKey key, offlineDevice caller, op linked", async () => {
      db.syncOperation.findUnique.mockResolvedValue(claimOp(fullPayload()));
      db.benefitUsage.findUnique.mockResolvedValue({ amountUsed: 0, activeHoldAmount: 0 });
      const res = await SyncService.reconcile("c1");
      expect(res.state).toBe("SYNCED");
      const [caller, submission] = submitMock.mock.calls[0];
      expect(caller).toMatchObject({ kind: "offlineDevice", tenantId: "t1", providerId: "p1", deviceId: "dev-9" });
      expect(submission).toMatchObject({ idempotencyKey: "op-key-1", externalClaimRef: "uuid-1", member: { memberNumber: "MVX-2026-00001" } });
      // operation links receipt + result claim BEFORE the SYNCED finalise
      expect(db.syncOperation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { receiptId: "rcp-1", resultClaimId: "clm-1" } }),
      );
      expect(inlineMock).toHaveBeenCalledWith("clm-1");
    });

    it("is idempotent across the migration boundary — an existing claim for the op links + syncs, no submit", async () => {
      db.syncOperation.findUnique.mockResolvedValue(claimOp(fullPayload()));
      db.claim.findFirst.mockResolvedValue({ id: "existing" });
      const res = await SyncService.reconcile("c1");
      expect(res.state).toBe("SYNCED");
      expect(submitMock).not.toHaveBeenCalled();
      expect(db.syncOperation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { resultClaimId: "existing" } }),
      );
    });

    it("a member-scope failure at the canonical boundary is a CONFLICT (visible, never lost)", async () => {
      db.syncOperation.findUnique.mockResolvedValue(claimOp(fullPayload()));
      db.member.findFirst.mockResolvedValue(null); // skip the reservation pre-check
      submitMock.mockRejectedValue(IntakeError.authorization("Member is not accessible to this caller."));
      const res = await SyncService.reconcile("c1");
      expect(res.state).toBe("CONFLICT");
      expect(res.reason).toMatch(/not accessible/i);
    });

    it("D6: an inactive membership is NOT a conflict — the claim is accepted and routed", async () => {
      db.syncOperation.findUnique.mockResolvedValue(claimOp(fullPayload()));
      // No local status gate remains; the canonical service accepts + routes.
      const res = await SyncService.reconcile("c1");
      expect(res.state).toBe("SYNCED");
      expect(submitMock).toHaveBeenCalled();
    });

    it("a transient canonical failure keeps the op PENDING (technical retry, no double-apply)", async () => {
      db.syncOperation.findUnique.mockResolvedValue(claimOp(fullPayload()));
      submitMock.mockRejectedValue(IntakeError.retryable());
      const res = await SyncService.reconcile("c1");
      expect(res.state).toBe("PENDING");
      // finalise never ran — no state transition write
      expect(db.syncOperation.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ state: expect.anything() }) }),
      );
    });

    it("CONFLICTs on incomplete payloads", async () => {
      db.syncOperation.findUnique.mockResolvedValue(claimOp({ amount: 100 }));
      expect((await SyncService.reconcile("c1")).state).toBe("CONFLICT");
      expect(submitMock).not.toHaveBeenCalled();
    });

    // ── PR-036 ──────────────────────────────────────────────────────────
    it("PR-036: a CONFLICT op is written to the Exception Register (never invisible)", async () => {
      db.syncOperation.findUnique.mockResolvedValue(claimOp(fullPayload()));
      db.member.findFirst.mockResolvedValue(null);
      submitMock.mockRejectedValue(IntakeError.authorization("Member is not accessible to this caller."));
      const res = await SyncService.reconcile("c1");
      expect(res.state).toBe("CONFLICT");
      expect(db.exceptionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reason: expect.stringMatching(/failed re-validation/i) }),
        }),
      );
    });

    it("PR-036: the work code's facility resolves the provider (free-text code irrelevant)", async () => {
      db.syncOperation.findUnique.mockResolvedValue({ ...claimOp(fullPayload({ providerCode: "GARBAGE" })), offlineAuthId: "auth1" });
      db.offlineWorkAuthorization.findUnique.mockResolvedValue({ provider: { id: "pAuth" } });
      db.provider.findFirst.mockResolvedValue(null); // free-text lookup would fail
      const res = await SyncService.reconcile("c1");
      expect(res.state).toBe("SYNCED");
      expect(submitMock.mock.calls[0][0]).toMatchObject({ kind: "offlineDevice", providerId: "pAuth" });
    });
  });
});
