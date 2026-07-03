import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  db: {
    tenant: { findMany: vi.fn(async (): Promise<any[]> => [{ id: "t1" }]) },
    providerContract: {
      findMany: vi.fn(async (): Promise<any[]> => []),
      updateMany: vi.fn(async (): Promise<any> => ({ count: 0 })),
    },
    claim: { findMany: vi.fn(async (): Promise<any[]> => []) },
  },
  activate: vi.fn(async () => ({})),
  persist: vi.fn(async () => ({ result: { matched: true } })),
}));
const db = h.db;
const activate = h.activate;
const persist = h.persist;

vi.mock("@/lib/prisma", () => ({ prisma: h.db }));
vi.mock("@/server/services/contract-lifecycle.service", () => ({ ContractLifecycleService: { activate: h.activate } }));
vi.mock("@/server/services/contract-engine/persist", () => ({ ContractEngineIntegration: { evaluateAndPersist: h.persist } }));
vi.mock("@/server/services/system-actor.service", () => ({ getSystemActorId: vi.fn(async () => "sys") }));

import { runContractLifecycleJob } from "@/server/jobs/contract-lifecycle.job";

beforeEach(() => {
  vi.clearAllMocks();
  db.tenant.findMany.mockResolvedValue([{ id: "t1" }]);
});

describe("runContractLifecycleJob (spec §4.3)", () => {
  it("auto-activates due APPROVED contracts and expires past-end ACTIVE ones", async () => {
    db.providerContract.findMany
      .mockResolvedValueOnce([{ id: "c1", contractNumber: "PC-1" }]) // due-to-activate
      .mockResolvedValueOnce([{ id: "c2", providerId: "p1" }]); // to-expire
    db.claim.findMany.mockResolvedValue([{ id: "clm1" }]);

    const result = await runContractLifecycleJob();

    expect(activate).toHaveBeenCalledWith("t1", "c1", "sys");
    expect(db.providerContract.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "EXPIRED" } }),
    );
    expect(result.activated).toBe(1);
    expect(result.expired).toBe(1);
    expect(result.reswept).toBe(1); // NO_CONTRACT claim re-swept after activation
  });

  it("does nothing when there is no due or expired contract", async () => {
    db.providerContract.findMany.mockResolvedValue([]);
    const result = await runContractLifecycleJob();
    expect(result).toEqual({ activated: 0, expired: 0, reswept: 0 });
    expect(activate).not.toHaveBeenCalled();
  });
});
