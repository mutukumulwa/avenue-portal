/**
 * Family Hospital UAT plan P04.02 step 2 — a correction/resubmission form is
 * seeded from the earlier claim's IMMUTABLE stored data: a price-list line as
 * its stored selection (name and captured rate), any other line as
 * "historical/unlisted", exactly as stored. No global price is read.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";

const db = vi.hoisted(() => ({ iCD10Code: { findUnique: vi.fn() }, cPTCode: { findMany: vi.fn(), findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { replacementSeed, type ReplacementSeedSource } from "@/server/services/provider-claim-seed";

const claim = (over: Partial<ReplacementSeedSource> = {}): ReplacementSeedSource => ({
  memberId: "mem-1",
  member: { firstName: "Amani", lastName: "Testmember" },
  providerBranchId: "br-1",
  providerBranch: { name: "Main" },
  serviceType: "OUTPATIENT",
  benefitCategory: "OUTPATIENT",
  dateOfService: new Date("2026-09-10T00:00:00Z"),
  attendingDoctor: null,
  billedAmount: new Prisma.Decimal("55000"),
  currency: "UGX",
  diagnoses: [{ icdCode: "b54", description: "stored text", isPrimary: true }],
  claimLines: [
    { lineNumber: 1, serviceCategory: "LABORATORY", description: "Full Blood Count", cptCode: null, quantity: 1, unitCost: new Prisma.Decimal("30000"), selectedProviderTariffId: "t-fbc", tariffRate: new Prisma.Decimal("25000") },
    { lineNumber: 2, serviceCategory: "CONSULTATION", description: "Office visit", cptCode: "99213", quantity: 1, unitCost: new Prisma.Decimal("25000"), selectedProviderTariffId: null, tariffRate: null },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.iCD10Code.findUnique.mockResolvedValue({ code: "B54", description: "Malaria, unspecified", category: "Certain infectious and parasitic diseases" });
});

describe("replacementSeed", () => {
  it("seeds a price-list line as its STORED selection and every other line as historical", async () => {
    const seed = await replacementSeed(claim());
    expect(seed.lines[0]).toMatchObject({
      key: "seed-1",
      serviceCategory: "LABORATORY",
      selected: { tariffId: "t-fbc", serviceName: "Full Blood Count", unitRate: "25000", currency: "UGX", category: "LABORATORY", selectable: true },
      billedUnitPrice: "30,000",
    });
    expect(seed.lines[0].historical).toBeUndefined();
    expect(seed.lines[1]).toEqual({
      key: "seed-2", serviceCategory: "CONSULTATION", selected: null, unlisted: false, historical: true, historicalLineNumber: 2,
      description: "Office visit", quantity: "1", billedUnitPrice: "25,000",
    });
    expect(db.cPTCode.findMany).not.toHaveBeenCalled();
    expect(db.cPTCode.findUnique).not.toHaveBeenCalled();
  });

  it("shows the stored primary diagnosis with the catalogue's description (either stored shape)", async () => {
    expect((await replacementSeed(claim())).diagnosis).toEqual({ code: "B54", description: "Malaria, unspecified", category: "Certain infectious and parasitic diseases" });
    expect(db.iCD10Code.findUnique).toHaveBeenLastCalledWith({ where: { code: "B54" }, select: { code: true, description: true, category: true } });
    await replacementSeed(claim({ diagnoses: [{ code: "E11.9" }, { code: "I10", isPrimary: true }] }));
    expect(db.iCD10Code.findUnique).toHaveBeenLastCalledWith(expect.objectContaining({ where: { code: "I10" } }));
    db.iCD10Code.findUnique.mockResolvedValue(null);
    expect((await replacementSeed(claim())).diagnosis).toBeNull();
  });

  it("keeps the member and branch fixed and the Kampala service date", async () => {
    const seed = await replacementSeed(claim());
    expect(seed.member).toEqual({ memberRef: "mem-1", branchId: "br-1", displayName: "Amani Testmember" });
    expect(seed.branchName).toBe("Main");
    expect(seed.serviceDate).toBe("2026-09-10");
    expect(seed.originalBilled).toBe("55000");
  });
});
