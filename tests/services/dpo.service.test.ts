import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  consentRecord: {
    create: vi.fn(async (a: any) => ({ id: "c1", ...a.data })),
    updateMany: vi.fn(async () => ({ count: 1 })),
    findFirst: vi.fn(async (): Promise<any> => null),
  },
  dataSubjectRequest: {
    create: vi.fn(async (a: any) => ({ id: "d1", ...a.data })),
    findFirst: vi.fn(async (): Promise<any> => ({ id: "d1" })),
    update: vi.fn(async (a: any) => ({ id: "d1", ...a.data })),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { DpoService } from "@/server/services/dpo.service";

describe("DpoService — DPPA-2019 (G1.2)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records a consent grant with purpose + lawful basis", async () => {
    await DpoService.recordConsent("t1", "m1", { purpose: "CLAIMS_PROCESSING", lawfulBasis: "CONTRACT", version: "v1" });
    expect(db.consentRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ purpose: "CLAIMS_PROCESSING", lawfulBasis: "CONTRACT" }) }),
    );
  });

  it("hasActiveConsent is true only for a granted, non-withdrawn consent", async () => {
    db.consentRecord.findFirst.mockResolvedValue({ id: "c1" });
    expect(await DpoService.hasActiveConsent("t1", "m1", "HEALTH_DATA_SHARING")).toBe(true);
    db.consentRecord.findFirst.mockResolvedValue(null);
    expect(await DpoService.hasActiveConsent("t1", "m1", "HEALTH_DATA_SHARING")).toBe(false);
  });

  it("withdrawConsent stamps withdrawnAt on active consents", async () => {
    await DpoService.withdrawConsent("t1", "m1", "MARKETING");
    expect(db.consentRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ withdrawnAt: null }), data: { withdrawnAt: expect.any(Date) } }),
    );
  });

  it("openDsr sets a statutory SLA deadline in the future", async () => {
    const before = Date.now();
    const dsr: any = await DpoService.openDsr("t1", "m1", "ACCESS");
    expect(dsr.status).toBe("RECEIVED");
    expect(dsr.slaDeadlineAt.getTime()).toBeGreaterThan(before);
  });

  it("setDsrStatus fulfils a request with an artefact ref", async () => {
    await DpoService.setDsrStatus("t1", "d1", "FULFILLED", "export-123.zip");
    expect(db.dataSubjectRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "FULFILLED", fulfilmentRef: "export-123.zip" } }),
    );
  });
});
