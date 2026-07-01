import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  syncOperation: {
    findUnique: vi.fn(),
    create: vi.fn(async (a: any) => ({ id: "op_" + a.data.opKey })),
    update: vi.fn(async () => ({})),
  },
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
});
