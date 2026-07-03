import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => {
  const tx = {
    caseServiceEntry: { create: vi.fn(async (a: any) => ({ id: "e1", ...a.data })), update: vi.fn(async (a: any) => a.data), aggregate: vi.fn(async () => ({ _sum: { totalAmount: 30_000 } })) },
    clinicalCase: { update: vi.fn(async (a: any) => a.data) },
    claim: { create: vi.fn(async (a: any) => ({ id: "clm1", ...a.data })) },
    preAuthorization: { updateMany: vi.fn(async () => ({ count: 1 })) },
    letterOfUndertaking: { updateMany: vi.fn(async () => ({ count: 0 })) },
  };
  return {
    tx,
    member: { findUnique: vi.fn() },
    provider: { findUnique: vi.fn() },
    clinicalCase: { count: vi.fn(async () => 0), create: vi.fn(async (a: any) => ({ id: "case1", ...a.data })), findUnique: vi.fn(), update: vi.fn(async (a: any) => a.data) },
    caseServiceEntry: { create: vi.fn(), findUnique: vi.fn(), aggregate: vi.fn() },
    preAuthorization: { findUnique: vi.fn(), update: vi.fn(async (a: any) => a.data), updateMany: vi.fn(async () => ({ count: 0 })) },
    letterOfUndertaking: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn(async () => 0), create: vi.fn() },
    claim: { count: vi.fn(async () => 41) },
    activityLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { CaseService } from "@/server/services/case.service";

const openCaseRow = (over: any = {}) => ({
  id: "case1", tenantId: "t1", caseNumber: "CASE-2026-00001", status: "OPEN",
  memberId: "m1", providerId: "p1", providerBranchId: null,
  caseType: "INPATIENT_ADMISSION", benefitCategory: "INPATIENT",
  admissionDate: new Date("2026-06-20"), dischargeDate: null,
  primaryDiagnoses: [{ icdCode: "E11.9" }], attendingDoctor: "Dr Otieno",
  accruedAmount: 30_000,
  serviceEntries: [
    { entryDate: new Date("2026-06-21"), category: "CONSULTATION", serviceCode: "SER001", description: "IP review", quantity: 1, unitAmount: 10_000, totalAmount: 10_000 },
    { entryDate: new Date("2026-06-22"), category: "PHARMACY", serviceCode: null, description: "Drugs", quantity: 2, unitAmount: 10_000, totalAmount: 20_000 },
  ],
  preauths: [{ id: "pa1" }],
  claims: [],
  ...over,
});

describe("CaseService.closeAndFile (WP-D2 — one case, one claim)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.clinicalCase.findUnique.mockResolvedValue(openCaseRow());
  });

  it("assembles exactly one claim: lines from non-voided entries, billed = accrued", async () => {
    const claim = await CaseService.closeAndFile("t1", "case1", "u1");
    expect(db.tx.claim.create).toHaveBeenCalledTimes(1);
    const data = db.tx.claim.create.mock.calls[0][0].data;
    expect(data.caseId).toBe("case1");
    expect(data.serviceType).toBe("INPATIENT");
    expect(data.claimLines.create).toHaveLength(2);
    expect(data.billedAmount).toBe(30_000);
    expect(claim.id).toBe("clm1");
  });

  it("re-points case PAs at the filed claim as ATTACHED", async () => {
    await CaseService.closeAndFile("t1", "case1", "u1");
    expect(db.tx.preAuthorization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { caseId: "case1" },
        data: expect.objectContaining({ claimId: "clm1", status: "ATTACHED" }),
      }),
    );
  });

  it("marks the case CLOSED_FILED", async () => {
    await CaseService.closeAndFile("t1", "case1", "u1");
    expect(db.tx.clinicalCase.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CLOSED_FILED" }) }),
    );
  });

  it("enforces one claim per case", async () => {
    db.clinicalCase.findUnique.mockResolvedValue(openCaseRow({ claims: [{ id: "existing" }] }));
    await expect(CaseService.closeAndFile("t1", "case1", "u1")).rejects.toThrow(/already has a filed claim/);
  });

  it("refuses to file an empty case", async () => {
    db.clinicalCase.findUnique.mockResolvedValue(openCaseRow({ serviceEntries: [] }));
    await expect(CaseService.closeAndFile("t1", "case1", "u1")).rejects.toThrow(/empty case/);
  });

  it("refuses to re-file a closed case", async () => {
    db.clinicalCase.findUnique.mockResolvedValue(openCaseRow({ status: "CLOSED_FILED" }));
    await expect(CaseService.closeAndFile("t1", "case1", "u1")).rejects.toThrow(/already closed/);
  });
});

describe("CaseService service entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.clinicalCase.findUnique.mockResolvedValue(openCaseRow());
  });

  it("adds an entry and recomputes accrued from non-voided entries", async () => {
    await CaseService.addServiceEntry({
      tenantId: "t1", caseId: "case1", entryDate: new Date(),
      category: "LABORATORY", description: "FBC", unitAmount: 1_500, quantity: 2,
    });
    const entry = db.tx.caseServiceEntry.create.mock.calls[0][0].data;
    expect(entry.totalAmount).toBe(3_000);
    expect(db.tx.caseServiceEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { caseId: "case1", voided: false } }),
    );
  });

  it("rejects writes on a closed case (immutability)", async () => {
    db.clinicalCase.findUnique.mockResolvedValue(openCaseRow({ status: "CLOSED_FILED" }));
    await expect(
      CaseService.addServiceEntry({
        tenantId: "t1", caseId: "case1", entryDate: new Date(),
        category: "LABORATORY", description: "FBC", unitAmount: 1_500,
      }),
    ).rejects.toThrow(/CLOSED_FILED/);
  });
});

describe("CaseService.attachPreauth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.clinicalCase.findUnique.mockResolvedValue(openCaseRow());
  });

  it("attaches an approved matching PA to the case", async () => {
    db.preAuthorization.findUnique.mockResolvedValue({
      memberId: "m1", providerId: "p1", status: "APPROVED", claimId: null, caseId: null,
    });
    await CaseService.attachPreauth("t1", "case1", "pa9");
    expect(db.preAuthorization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { caseId: "case1" } }),
    );
  });

  it("rejects a PA already attached elsewhere", async () => {
    db.preAuthorization.findUnique.mockResolvedValue({
      memberId: "m1", providerId: "p1", status: "APPROVED", claimId: "other", caseId: null,
    });
    await expect(CaseService.attachPreauth("t1", "case1", "pa9")).rejects.toThrow(/already attached/);
  });
});
