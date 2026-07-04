/**
 * PR-010 acceptance — DRAFT contracts editable with audited field diffs;
 * abandoned drafts voidable (terminal, reasoned); non-DRAFT edits rejected
 * server-side.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  providerContract: {
    findUnique: vi.fn(),
    update: vi.fn(async (a: any) => ({ id: a.where.id, ...a.data })),
  },
  auditLog: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

const audit = vi.hoisted(() => ({ append: vi.fn(async (_a?: any) => ({})) }));
vi.mock("@/server/services/audit-chain.service", () => ({ auditChainService: audit }));

import { ContractLifecycleService } from "@/server/services/contract-lifecycle.service";

const T = "t1";
const contract = (over: Partial<any> = {}) => ({
  id: "pc1",
  tenantId: T,
  contractNumber: "PC-2026-002",
  status: "DRAFT",
  title: "Old title",
  startDate: new Date("2026-01-01"),
  endDate: new Date("2026-12-31"),
  paymentTermDays: 30,
  notes: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.providerContract.findUnique.mockResolvedValue(contract());
});

describe("editDraftHeader (PR-010)", () => {
  it("edits header fields in DRAFT and audits a field-level before/after diff", async () => {
    await ContractLifecycleService.editDraftHeader(T, "pc1", "u1", {
      startDate: new Date("2026-06-01"),
      title: "New title",
    });
    expect(db.providerContract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: "New title" }),
      }),
    );
    const payload = audit.append.mock.calls[0][0].payload as { diff: Record<string, { before: unknown; after: unknown }> };
    expect(payload.diff.title).toEqual({ before: "Old title", after: "New title" });
    expect(payload.diff.startDate).toEqual({ before: "2026-01-01", after: "2026-06-01" });
  });

  it("rejects header edits on a non-DRAFT contract even via direct invocation", async () => {
    for (const status of ["UNDER_REVIEW", "APPROVED", "ACTIVE", "SUSPENDED"]) {
      db.providerContract.findUnique.mockResolvedValue(contract({ status }));
      await expect(
        ContractLifecycleService.editDraftHeader(T, "pc1", "u1", { title: "x" }),
      ).rejects.toThrow(/only be edited in DRAFT/);
    }
    expect(db.providerContract.update).not.toHaveBeenCalled();
  });

  it("no-ops (no write, no audit) when nothing changed", async () => {
    await ContractLifecycleService.editDraftHeader(T, "pc1", "u1", { title: "Old title" });
    expect(db.providerContract.update).not.toHaveBeenCalled();
    expect(audit.append).not.toHaveBeenCalled();
  });

  it("rejects an end date before the start date", async () => {
    await expect(
      ContractLifecycleService.editDraftHeader(T, "pc1", "u1", {
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-07-01"),
      }),
    ).rejects.toThrow(/End date must be after/);
  });
});

describe("voidContract (PR-010 D2)", () => {
  it("voids a DRAFT with a reason and audits it", async () => {
    await ContractLifecycleService.voidContract(T, "pc1", "u1", "wrong provider captured");
    expect(db.providerContract.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "VOIDED" }) }),
    );
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "CONTRACT:VOIDED" }));
  });

  it("requires a reason", async () => {
    await expect(ContractLifecycleService.voidContract(T, "pc1", "u1", " ")).rejects.toThrow(/reason/);
  });

  it("VOIDED is reachable from DRAFT only", async () => {
    for (const status of ["UNDER_REVIEW", "APPROVED", "ACTIVE"]) {
      db.providerContract.findUnique.mockResolvedValue(contract({ status }));
      await expect(ContractLifecycleService.voidContract(T, "pc1", "u1", "some reason")).rejects.toThrow(
        /Illegal contract status transition/,
      );
    }
  });
});
