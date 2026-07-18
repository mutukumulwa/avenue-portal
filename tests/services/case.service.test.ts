import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => {
  const tx = {
    // updateMany returns count = #ids targeted, so the cutInterimSlice atomic
    // freeze ("all eligible entries still unbilled") passes by default.
    caseServiceEntry: { create: vi.fn(async (a: any) => ({ id: "e1", ...a.data })), update: vi.fn(async (a: any) => a.data), updateMany: vi.fn(async (a: any) => ({ count: a?.where?.id?.in?.length ?? 0 })), aggregate: vi.fn(async () => ({ _sum: { totalAmount: 30_000 } })), findMany: vi.fn(async (): Promise<any[]> => []) },
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
    caseServiceEntry: { create: vi.fn(), findUnique: vi.fn(), aggregate: vi.fn(), findMany: vi.fn(async (): Promise<any[]> => []) },
    preAuthorization: { findUnique: vi.fn(), update: vi.fn(async (a: any) => a.data), updateMany: vi.fn(async () => ({ count: 0 })), findMany: vi.fn(async (): Promise<any[]> => []) },
    letterOfUndertaking: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn(async () => 0), create: vi.fn() },
    claim: { count: vi.fn(async () => 41), create: vi.fn(async (a: any) => ({ id: "clm1", ...a.data })), findUnique: vi.fn(), findMany: vi.fn(async (): Promise<any[]> => []) },
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
  currency: "UGX",
  serviceEntries: [
    { id: "se1", entryDate: new Date("2026-06-21"), category: "CONSULTATION", serviceCode: "SER001", description: "IP review", quantity: 1, unitAmount: 10_000, totalAmount: 10_000, voided: false, billedInClaimId: null },
    { id: "se2", entryDate: new Date("2026-06-22"), category: "PHARMACY", serviceCode: null, description: "Drugs", quantity: 2, unitAmount: 10_000, totalAmount: 20_000, voided: false, billedInClaimId: null },
  ],
  preauths: [{ id: "pa1" }],
  claims: [],
  ...over,
});

describe("CaseService.closeAndFile (IPL-001 — final claim bills the residual)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.clinicalCase.findUnique.mockResolvedValue(openCaseRow());
  });

  it("with no prior slices, files the whole case as one non-interim final claim", async () => {
    const claim = await CaseService.closeAndFile("t1", "case1", "u1");
    expect(db.tx.claim.create).toHaveBeenCalledTimes(1);
    const data = db.tx.claim.create.mock.calls[0][0].data;
    expect(data.caseId).toBe("case1");
    expect(data.serviceType).toBe("INPATIENT");
    expect(data.claimLines.create).toHaveLength(2);
    expect(data.billedAmount).toBe(30_000);
    expect(data.isInterimBill).toBe(false);
    expect(data.caseSliceSeq).toBe(1);
    expect(data.currency).toBe("UGX");
    expect(claim?.id).toBe("clm1");
  });

  it("freezes the residual entries onto the final claim (exhaustive billing owner)", async () => {
    await CaseService.closeAndFile("t1", "case1", "u1");
    expect(db.tx.caseServiceEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["se1", "se2"] }, billedInClaimId: null },
        data: { billedInClaimId: "clm1" },
      }),
    );
  });

  it("re-points only still-available case PAs at the final claim as ATTACHED", async () => {
    await CaseService.closeAndFile("t1", "case1", "u1");
    expect(db.tx.preAuthorization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { caseId: "case1", status: "APPROVED", claimId: null },
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

  it("SET-03: after prior slices, the final claim bills only the residual (unbilled) lines, seq continues", async () => {
    db.clinicalCase.findUnique.mockResolvedValue(openCaseRow({
      // one line already frozen onto slice 1, one still unbilled
      serviceEntries: [
        { id: "se1", entryDate: new Date("2026-06-21"), category: "CONSULTATION", serviceCode: "SER001", description: "IP review", quantity: 1, unitAmount: 10_000, totalAmount: 10_000, voided: false, billedInClaimId: "slice1" },
        { id: "se2", entryDate: new Date("2026-06-22"), category: "PHARMACY", serviceCode: null, description: "Drugs", quantity: 2, unitAmount: 10_000, totalAmount: 20_000, voided: false, billedInClaimId: null },
      ],
      claims: [{ caseSliceSeq: 1 }],
    }));
    await CaseService.closeAndFile("t1", "case1", "u1");
    const data = db.tx.claim.create.mock.calls[0][0].data;
    expect(data.claimLines.create).toHaveLength(1); // only the residual line
    expect(data.claimLines.create[0].description).toBe("Drugs");
    expect(data.billedAmount).toBe(20_000); // NOT the 30_000 case accrued (slice1's 10_000 is not re-billed)
    expect(data.caseSliceSeq).toBe(2); // continues after slice 1
  });

  it("SET-03: when every line is already sliced, closes the case with NO final claim", async () => {
    db.clinicalCase.findUnique.mockResolvedValue(openCaseRow({
      serviceEntries: [
        { id: "se1", entryDate: new Date("2026-06-21"), category: "CONSULTATION", serviceCode: "SER001", description: "IP review", quantity: 1, unitAmount: 10_000, totalAmount: 10_000, voided: false, billedInClaimId: "slice1" },
        { id: "se2", entryDate: new Date("2026-06-22"), category: "PHARMACY", serviceCode: null, description: "Drugs", quantity: 2, unitAmount: 10_000, totalAmount: 20_000, voided: false, billedInClaimId: "slice2" },
      ],
      claims: [{ caseSliceSeq: 1 }, { caseSliceSeq: 2 }],
    }));
    const result = await CaseService.closeAndFile("t1", "case1", "u1");
    expect(result).toBeNull();
    expect(db.tx.claim.create).not.toHaveBeenCalled(); // no empty final claim
    expect(db.tx.clinicalCase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CLOSED_FILED" }) }),
    );
    expect(db.tx.letterOfUndertaking.updateMany).toHaveBeenCalled(); // LOUs still consumed
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

// ─── IPL-001 — interim / periodic inpatient settlement (Option A) ────────────
const sliceCaseRow = (over: any = {}) => ({
  id: "case1", tenantId: "t1", caseNumber: "CASE-2026-00001", status: "OPEN",
  memberId: "m1", providerId: "p1", providerBranchId: null,
  caseType: "INPATIENT_ADMISSION", benefitCategory: "INPATIENT",
  admissionDate: new Date("2026-08-01"), currency: "UGX",
  attendingDoctor: "Dr Otieno", primaryDiagnoses: [{ icdCode: "S72.0" }],
  claims: [],
  preauths: [],
  ...over,
});

const eligible = [
  { id: "se1", entryDate: new Date("2026-08-02"), category: "OTHER", serviceCode: "BED-WARD", description: "Ward bed day", quantity: 1, unitAmount: 200_000, totalAmount: 200_000 },
  { id: "se2", entryDate: new Date("2026-08-05"), category: "PHARMACY", serviceCode: null, description: "IV antibiotics", quantity: 3, unitAmount: 100_000, totalAmount: 300_000 },
];

describe("CaseService.cutInterimSlice (SET-01 — immutable slice on an open case)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.clinicalCase.findUnique.mockResolvedValue(sliceCaseRow());
    db.caseServiceEntry.findMany.mockResolvedValue(eligible);
  });

  const cut = (over: any = {}) =>
    CaseService.cutInterimSlice({ tenantId: "t1", caseId: "case1", cutoffDate: new Date("2026-08-07"), cutById: "u1", ...over });

  it("creates ONE interim claim from the unbilled lines, own invoice, service range, case stays OPEN", async () => {
    const slice = await cut();
    expect(db.tx.claim.create).toHaveBeenCalledTimes(1);
    const data = db.tx.claim.create.mock.calls[0][0].data;
    expect(data.isInterimBill).toBe(true);
    expect(data.caseSliceSeq).toBe(1);
    expect(data.invoiceNumber).toBe("CASE-2026-00001-S1");
    expect(data.billedAmount).toBe(500_000);
    expect(data.claimLines.create).toHaveLength(2);
    expect(data.status).toBe("RECEIVED");
    expect(data.caseId).toBe("case1");
    expect(data.currency).toBe("UGX");
    expect(data.sliceServiceFrom).toEqual(new Date("2026-08-02"));
    expect(data.sliceServiceTo).toEqual(new Date("2026-08-05"));
    // Case is NEVER closed by a slice cut — it keeps accruing.
    expect(db.tx.clinicalCase.updateMany).not.toHaveBeenCalled();
    expect(slice?.id).toBe("clm1");
  });

  it("SET-02: freezes exactly the sliced entries by identity so they can never be re-billed", async () => {
    await cut();
    expect(db.tx.caseServiceEntry.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["se1", "se2"] }, billedInClaimId: null },
      data: { billedInClaimId: "clm1" },
    });
  });

  it("SET-02: the second slice's sequence and invoice continue after the first", async () => {
    db.clinicalCase.findUnique.mockResolvedValue(sliceCaseRow({ claims: [{ caseSliceSeq: 1 }] }));
    await cut();
    const data = db.tx.claim.create.mock.calls[0][0].data;
    expect(data.caseSliceSeq).toBe(2);
    expect(data.invoiceNumber).toBe("CASE-2026-00001-S2");
  });

  it("uses a provider-supplied invoice reference when given", async () => {
    await cut({ invoiceNumber: "KH/INV/9931" });
    expect(db.tx.claim.create.mock.calls[0][0].data.invoiceNumber).toBe("KH/INV/9931");
  });

  it("throws when there is nothing new to bill since the last slice", async () => {
    db.caseServiceEntry.findMany.mockResolvedValue([]);
    await expect(cut()).rejects.toThrow(/No unbilled services/i);
    expect(db.tx.claim.create).not.toHaveBeenCalled();
  });

  it("concurrency: if another cut just grabbed a line, the freeze count mismatches and rolls back", async () => {
    db.tx.caseServiceEntry.updateMany.mockResolvedValueOnce({ count: 1 }); // only 1 of 2 frozen
    await expect(cut()).rejects.toThrow(/just billed on another slice/i);
  });

  it("attaches the case's available approved PAs to the slice so the hold is credited at decision", async () => {
    db.clinicalCase.findUnique.mockResolvedValue(sliceCaseRow({ preauths: [{ id: "pa1", status: "APPROVED" }] }));
    await cut();
    expect(db.tx.preAuthorization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { caseId: "case1", status: "APPROVED", claimId: null },
        data: expect.objectContaining({ claimId: "clm1", status: "ATTACHED" }),
      }),
    );
  });

  it("hard-flags the slice with a HIGH fraud alert on same-day bed-day overlap", async () => {
    db.caseServiceEntry.findMany.mockResolvedValue([
      { id: "se1", entryDate: new Date("2026-08-02"), category: "OTHER", serviceCode: "BED-WARD", description: "Ward bed day", quantity: 1, unitAmount: 200_000, totalAmount: 200_000 },
      { id: "se2", entryDate: new Date("2026-08-02"), category: "OTHER", serviceCode: "BED-ICU", description: "ICU bed day", quantity: 1, unitAmount: 650_000, totalAmount: 650_000 },
    ]);
    await cut();
    expect(db.tx.claimFraudAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rule: "Overlapping Bed-Day Charges", severity: "HIGH" }) }),
    );
  });

  it("refuses to slice a closed or cancelled case", async () => {
    db.clinicalCase.findUnique.mockResolvedValue(sliceCaseRow({ status: "CLOSED_FILED" }));
    await expect(cut()).rejects.toThrow(/already closed/i);
    db.clinicalCase.findUnique.mockResolvedValue(sliceCaseRow({ status: "CANCELLED" }));
    await expect(cut()).rejects.toThrow(/cancelled/i);
  });

  it("refuses a cut-off before the admission date", async () => {
    await expect(cut({ cutoffDate: new Date("2026-07-20") })).rejects.toThrow(/before the admission date/i);
  });

  it("TIME-05: the cut-off day is inclusive — filters entries with entryDate <= end of the cut-off day", async () => {
    await cut({ cutoffDate: new Date("2026-08-07") });
    const where = (db.caseServiceEntry.findMany.mock.calls[0] as any[])[0].where;
    expect(where).toMatchObject({ caseId: "case1", voided: false, billedInClaimId: null });
    // end-of-day boundary, not midnight, so a Friday entry is included
    expect(where.entryDate.lte).toEqual(new Date(Date.UTC(2026, 7, 7, 23, 59, 59, 999)));
  });
});

describe("CaseService.voidServiceEntry — a billed line is immutable (CASE-12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.clinicalCase.findUnique.mockResolvedValue(openCaseRow());
  });

  it("rejects voiding a line already frozen onto a slice", async () => {
    db.caseServiceEntry.findUnique.mockResolvedValue({ id: "se1", caseId: "case1", voided: false, billedInClaimId: "clm1" });
    db.claim.findUnique.mockResolvedValue({ claimNumber: "CLM-2026-00042" });
    await expect(CaseService.voidServiceEntry("t1", "case1", "se1", "typo")).rejects.toThrow(/already billed on slice CLM-2026-00042/i);
    expect(db.tx.caseServiceEntry.update).not.toHaveBeenCalled();
  });

  it("still voids an unbilled line normally", async () => {
    db.caseServiceEntry.findUnique.mockResolvedValue({ id: "se2", caseId: "case1", voided: false, billedInClaimId: null });
    await CaseService.voidServiceEntry("t1", "case1", "se2", "duplicate");
    expect(db.tx.caseServiceEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "se2" }, data: expect.objectContaining({ voided: true }) }),
    );
  });
});

describe("CaseService.getCaseReconciliation — per-case seven-ledger view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.clinicalCase.findUnique.mockResolvedValue({ currency: "UGX" });
  });

  it("derives billed / approved / paid / outstanding / guarantee to-date from the case claims", async () => {
    db.claim.findMany.mockResolvedValue([
      { id: "s1", claimNumber: "CLM-1", invoiceNumber: "CASE-1-S1", caseSliceSeq: 1, isInterimBill: true, sliceCutoffAt: new Date("2026-08-07"), sliceServiceFrom: new Date("2026-08-02"), sliceServiceTo: new Date("2026-08-06"), billedAmount: 500_000, approvedAmount: 450_000, memberLiability: 50_000, status: "APPROVED", decidedAt: new Date(), settlementBatch: { status: "SETTLED" } },
      { id: "s2", claimNumber: "CLM-2", invoiceNumber: "CASE-1-S2", caseSliceSeq: 2, isInterimBill: true, sliceCutoffAt: new Date("2026-08-14"), sliceServiceFrom: new Date("2026-08-08"), sliceServiceTo: new Date("2026-08-13"), billedAmount: 300_000, approvedAmount: 300_000, memberLiability: 0, status: "APPROVED", decidedAt: new Date(), settlementBatch: null },
    ]);
    db.caseServiceEntry.findMany.mockResolvedValue([
      { totalAmount: 500_000, billedInClaimId: "s1" },
      { totalAmount: 300_000, billedInClaimId: "s2" },
      { totalAmount: 120_000, billedInClaimId: null }, // still accruing, not yet sliced
    ]);
    db.preAuthorization.findMany.mockResolvedValue([
      { approvedAmount: 1_000_000, estimatedCost: null, utilisedAmount: 750_000, status: "APPROVED" },
    ]);

    const r = await CaseService.getCaseReconciliation("t1", "case1");
    expect(r.billedToDate).toBe(920_000);       // B = 500k + 300k + 120k
    expect(r.billedOnSlices).toBe(800_000);      // frozen onto slices
    expect(r.unbilledResidual).toBe(120_000);    // still open
    expect(r.approvedToDate).toBe(750_000);      // U = 450k + 300k
    expect(r.paidToDate).toBe(450_000);          // S = only the SETTLED slice
    expect(r.outstanding).toBe(300_000);         // approved − paid
    expect(r.memberShare).toBe(50_000);
    expect(r.remainingGuarantee).toBe(250_000);  // 1,000k PA − 750k utilised
    expect(r.sliceCount).toBe(2);
    expect(r.slices).toHaveLength(2);
  });
});
