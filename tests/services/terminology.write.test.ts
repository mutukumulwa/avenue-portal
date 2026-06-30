import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  terminologyEntry: {
    findFirst: vi.fn(),
    findUnique: vi.fn(async () => ({ id: "e1", status: "APPROVED" })),
    update: vi.fn(async (a: any) => ({ id: a.where.id })),
    updateMany: vi.fn(async () => ({ count: 1 })),
    create: vi.fn(async (a: any) => ({ id: "new", ...a.data })),
  },
  terminologyApproval: { create: vi.fn(async () => ({ id: "ap1" })) },
  $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { TerminologyService } from "@/server/services/terminology.service";

const T = "t1";

describe("TerminologyService — maker-checker write path (G2.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.terminologyEntry.findUnique.mockResolvedValue({ id: "e1", status: "APPROVED" } as any);
  });

  it("createDraft rejects a CLIENT-scoped term without a clientId", async () => {
    await expect(
      TerminologyService.createDraft(T, { scope: "CLIENT", key: "policy", displayText: "Plan" }, "u1"),
    ).rejects.toThrow(/clientId/);
  });

  it("createDraft rejects a SYSTEM term that targets a client", async () => {
    await expect(
      TerminologyService.createDraft(
        T,
        { scope: "SYSTEM", clientId: "c1", key: "policy", displayText: "Plan" },
        "u1",
      ),
    ).rejects.toThrow(/cannot target a client/);
  });

  it("submit moves DRAFT → PENDING and records SUBMITTED", async () => {
    db.terminologyEntry.findFirst.mockResolvedValue({ id: "e1", status: "DRAFT", createdById: "u1" });
    await TerminologyService.submit(T, "e1", "u1");
    expect(db.terminologyEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PENDING_APPROVAL" } }),
    );
    expect(db.terminologyApproval.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "SUBMITTED" }) }),
    );
  });

  it("approve enforces segregation of duties (maker ≠ checker)", async () => {
    db.terminologyEntry.findFirst.mockResolvedValue({
      id: "e1",
      status: "PENDING_APPROVAL",
      createdById: "u1",
    });
    await expect(TerminologyService.approve(T, "e1", "u1")).rejects.toThrow(/Segregation of duties/);
  });

  it("approve by a different user supersedes the prior active entry (never-delete)", async () => {
    db.terminologyEntry.findFirst.mockResolvedValue({
      id: "e1",
      status: "PENDING_APPROVAL",
      createdById: "u1",
      scope: "HOUSE",
      clientId: null,
      locale: null,
      key: "policy",
    });
    await TerminologyService.approve(T, "e1", "u2");
    // Supersede prior active approved entry for the same coordinates.
    expect(db.terminologyEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: "policy", status: "APPROVED", isActive: true, id: { not: "e1" } }),
        data: expect.objectContaining({ isActive: false }),
      }),
    );
    // Promote this entry to APPROVED + active.
    expect(db.terminologyEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED", isActive: true, approvedById: "u2" }) }),
    );
  });

  it("approve rejects entries not pending approval", async () => {
    db.terminologyEntry.findFirst.mockResolvedValue({ id: "e1", status: "DRAFT", createdById: "u1" });
    await expect(TerminologyService.approve(T, "e1", "u2")).rejects.toThrow(/pending approval/);
  });

  it("reject moves PENDING → REJECTED", async () => {
    db.terminologyEntry.findFirst.mockResolvedValue({ id: "e1", status: "PENDING_APPROVAL", createdById: "u1" });
    await TerminologyService.reject(T, "e1", "u2", "wrong term");
    expect(db.terminologyEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REJECTED" } }),
    );
  });
});
