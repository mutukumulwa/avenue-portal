import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => {
  const tx = {
    caseServiceEntry: { create: vi.fn(async (a: any) => ({ id: "e1", ...a.data })), update: vi.fn(async (a: any) => a.data), aggregate: vi.fn(async () => ({ _sum: { totalAmount: 30_000 } })), findMany: vi.fn(async (): Promise<any[]> => []) },
    clinicalCase: { update: vi.fn(async (a: any) => a.data), updateMany: vi.fn(async () => ({ count: 1 })) },
    claim: { create: vi.fn(async (a: any) => ({ id: "clm1", ...a.data })) },
    preAuthorization: { updateMany: vi.fn(async () => ({ count: 1 })) },
    letterOfUndertaking: { updateMany: vi.fn(async () => ({ count: 0 })) },
    claimFraudAlert: { create: vi.fn(async () => ({})) },
    activityLog: { create: vi.fn(async () => ({})) },
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

  it("marks the case CLOSED_FILED via the FG-C9 atomic status-guarded claim", async () => {
    await CaseService.closeAndFile("t1", "case1", "u1");
    expect(db.tx.clinicalCase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "case1", tenantId: "t1", status: { in: ["OPEN", "PENDING_CLOSURE"] } }),
        data: expect.objectContaining({ status: "CLOSED_FILED" }),
      }),
    );
  });

  it("FG-C9: a concurrent second file is atomically rejected — no second claim", async () => {
    // The winner already flipped the case to CLOSED_FILED, so the atomic claim
    // matches 0 rows for the loser (its pre-check saw the stale OPEN case).
    db.tx.clinicalCase.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(CaseService.closeAndFile("t1", "case1", "u1")).rejects.toThrow(/just been filed/i);
    expect(db.tx.claim.create).not.toHaveBeenCalled();
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

// ─── WP-2 IP-DEF-02 — entry dates inside the admission episode ───────────────
describe("IP-DEF-02 — service entry dates are bounded by the episode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.clinicalCase.findUnique.mockResolvedValue(openCaseRow());
  });

  const entry = (entryDate: Date) =>
    CaseService.addServiceEntry({
      tenantId: "t1", caseId: "case1", entryDate,
      category: "PROCEDURE", description: "Dressing change", unitAmount: 5_000,
    });

  it("rejects a FUTURE service entry (was accepted and accrued billable money)", async () => {
    await expect(entry(new Date(Date.now() + 3 * 86_400_000))).rejects.toThrow(/future/i);
    expect(db.tx.caseServiceEntry.create).not.toHaveBeenCalled();
  });

  it("rejects an entry BEFORE the admission date", async () => {
    await expect(entry(new Date("2026-06-10"))).rejects.toThrow(/before the admission date/i);
    expect(db.tx.caseServiceEntry.create).not.toHaveBeenCalled();
  });

  it("rejects an entry AFTER the discharge date", async () => {
    db.clinicalCase.findUnique.mockResolvedValue(openCaseRow({ dischargeDate: new Date("2026-06-25") }));
    await expect(entry(new Date("2026-06-28"))).rejects.toThrow(/after the discharge date/i);
    expect(db.tx.caseServiceEntry.create).not.toHaveBeenCalled();
  });

  it("accepts an entry ON the admission day", async () => {
    await entry(new Date("2026-06-20"));
    expect(db.tx.caseServiceEntry.create).toHaveBeenCalledTimes(1);
  });
});

// ─── WP-3 IP-DEF-04 — same-date bed-day overlap ──────────────────────────────
describe("IP-DEF-04 — overlapping bed-day charges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.clinicalCase.findUnique.mockResolvedValue(openCaseRow());
  });

  it("detectBedDayOverlaps: ward + ICU beds on one day flag; bedside X-ray and ward rounds do not", () => {
    const overlaps = CaseService.detectBedDayOverlaps([
      { entryDate: new Date("2026-06-21"), description: "General ward bed day", serviceCode: "BED-WARD" },
      { entryDate: new Date("2026-06-21"), description: "ICU bed day", serviceCode: "BED-ICU" },
      { entryDate: new Date("2026-06-21"), description: "Bedside X-ray" },
      { entryDate: new Date("2026-06-21"), description: "Doctor's ward round" },
      { entryDate: new Date("2026-06-22"), description: "General ward bed day" },
      { entryDate: new Date("2026-06-23"), description: "ICU bed day", voided: true },
      { entryDate: new Date("2026-06-23"), description: "General ward bed day" },
    ]);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].day).toBe("2026-06-21");
    expect(overlaps[0].items).toEqual(["General ward bed day", "ICU bed day"]);
  });

  it("closeAndFile hard-flags the filed claim with a HIGH fraud alert when bed-days overlap", async () => {
    db.clinicalCase.findUnique.mockResolvedValue(openCaseRow({
      serviceEntries: [
        { entryDate: new Date("2026-06-21"), category: "OTHER", serviceCode: "BED-WARD", description: "General ward bed day", quantity: 1, unitAmount: 200_000, totalAmount: 200_000 },
        { entryDate: new Date("2026-06-21"), category: "OTHER", serviceCode: "BED-ICU", description: "ICU bed day", quantity: 1, unitAmount: 650_000, totalAmount: 650_000 },
      ],
    }));
    await CaseService.closeAndFile("t1", "case1", "u1");
    expect(db.tx.claimFraudAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          claimId: "clm1",
          rule: "Overlapping Bed-Day Charges",
          severity: "HIGH",
          notes: expect.stringContaining("2026-06-21"),
        }),
      }),
    );
  });

  it("closeAndFile does NOT flag distinct-day bed charges", async () => {
    await CaseService.closeAndFile("t1", "case1", "u1");
    expect(db.tx.claimFraudAlert.create).not.toHaveBeenCalled();
  });

  it("addServiceEntry records a timeline warning the moment a second same-day bed-day lands", async () => {
    db.tx.caseServiceEntry.findMany.mockResolvedValue([
      { description: "General ward bed day", serviceCode: "BED-WARD" },
    ]);
    await CaseService.addServiceEntry({
      tenantId: "t1", caseId: "case1", entryDate: new Date("2026-06-21"),
      category: "OTHER", serviceCode: "BED-ICU", description: "ICU bed day", unitAmount: 650_000,
      enteredById: "u1",
    });
    expect(db.tx.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "BED_DAY_OVERLAP", entityId: "case1" }),
      }),
    );
  });
});
