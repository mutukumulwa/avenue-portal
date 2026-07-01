import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  syncOperation: {
    findUnique: vi.fn(),
    create: vi.fn(async (a: any) => ({ id: "op_" + a.data.opKey })),
    update: vi.fn(async () => ({})),
  },
  member: { findFirst: vi.fn() },
  provider: { findFirst: vi.fn() },
  claim: { findFirst: vi.fn(async (): Promise<any> => null), count: vi.fn(async () => 0), create: vi.fn(async () => ({ id: "clm1" })) },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { SyncService } from "@/server/services/sync.service";

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

  describe("reconcile — Claim re-validation + creation (Phase-1)", () => {
    const fullPayload = (over: any = {}) => ({
      memberNumber: "MVX-2026-00001", providerCode: "SLD-001", serviceType: "OUTPATIENT",
      lineItems: [{ description: "Consult", quantity: 1, unitCost: 50000 }], ...over,
    });
    const claimOp = (payload: any) => ({ id: "c1", tenantId: "t1", clientUuid: "uuid-1", state: "PENDING", entityType: "Claim", payload });
    const activeMember = { id: "m1", status: "ACTIVE", group: { status: "ACTIVE" } };
    const okProvider = { id: "p1", contractStatus: "ACTIVE" };

    beforeEach(() => {
      db.member.findFirst.mockResolvedValue(activeMember);
      db.provider.findFirst.mockResolvedValue(okProvider);
      db.claim.findFirst.mockResolvedValue(null);
    });

    it("SYNCs + creates a claim for a clean offline capture", async () => {
      db.syncOperation.findUnique.mockResolvedValue(claimOp(fullPayload()));
      const res = await SyncService.reconcile("c1");
      expect(res.state).toBe("SYNCED");
      expect(db.claim.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ source: "OFFLINE_SYNC", externalRef: "uuid-1" }) }),
      );
    });

    it("is idempotent — an existing claim for the op is not recreated", async () => {
      db.syncOperation.findUnique.mockResolvedValue(claimOp(fullPayload()));
      db.claim.findFirst.mockResolvedValue({ id: "existing" });
      const res = await SyncService.reconcile("c1");
      expect(res.state).toBe("SYNCED");
      expect(db.claim.create).not.toHaveBeenCalled();
    });

    it("CONFLICTs when the member is not found at sync time", async () => {
      db.syncOperation.findUnique.mockResolvedValue(claimOp(fullPayload()));
      db.member.findFirst.mockResolvedValue(null);
      const res = await SyncService.reconcile("c1");
      expect(res.state).toBe("CONFLICT");
      expect(res.reason).toMatch(/not found/i);
      expect(db.claim.create).not.toHaveBeenCalled();
    });

    it("CONFLICTs when the membership is inactive", async () => {
      db.syncOperation.findUnique.mockResolvedValue(claimOp(fullPayload()));
      db.member.findFirst.mockResolvedValue({ ...activeMember, status: "SUSPENDED" });
      expect((await SyncService.reconcile("c1")).state).toBe("CONFLICT");
    });

    it("CONFLICTs when the provider is not found / contract inactive", async () => {
      db.syncOperation.findUnique.mockResolvedValue(claimOp(fullPayload()));
      db.provider.findFirst.mockResolvedValue({ id: "p1", contractStatus: "SUSPENDED" });
      expect((await SyncService.reconcile("c1")).state).toBe("CONFLICT");
    });

    it("CONFLICTs on incomplete payloads", async () => {
      db.syncOperation.findUnique.mockResolvedValue(claimOp({ amount: 100 }));
      expect((await SyncService.reconcile("c1")).state).toBe("CONFLICT");
    });
  });
});
