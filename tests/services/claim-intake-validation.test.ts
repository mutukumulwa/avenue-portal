/**
 * BB2-DEF-01 defence in depth: the canonical claim-intake path (runClaimIntake)
 * must reject non-positive or inconsistent line amounts up front — before any
 * DB write — regardless of which rail (admin wizard, provider portal, B2B) calls
 * it. The guard is the first statement in the function, so these cases throw
 * before prisma is ever touched.
 */
import { describe, it, expect, vi } from "vitest";
import type { ClaimIntakeInput } from "@/server/services/claim-intake";

// The guard runs before any prisma/service call; mock the module boundary just
// so the file imports cleanly.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));

import { runClaimIntake } from "@/server/services/claim-intake";

const base = (lineItems: ClaimIntakeInput["lineItems"]): ClaimIntakeInput => ({
  memberId: "m1",
  providerId: "p1",
  serviceType: "OUTPATIENT" as never,
  benefitCategory: "OUTPATIENT" as never,
  dateOfService: "2026-07-01",
  diagnoses: [{ code: "I10", description: "Hypertension", standardCharge: null, isPrimary: true }],
  lineItems,
});

const line = (over: Partial<ClaimIntakeInput["lineItems"][number]>) => ({
  serviceCategory: "OTHER" as never,
  cptCode: "",
  description: "Service",
  icdCode: "I10",
  quantity: 1,
  unitCost: 1000,
  billedAmount: 1000,
  ...over,
});

describe("runClaimIntake — line-amount positivity gate (BB2-DEF-01)", () => {
  it("rejects a zero quantity", async () => {
    await expect(
      runClaimIntake("t1", "u1", base([line({ quantity: 0, billedAmount: 0 })])),
    ).rejects.toThrow(/quantity must be a whole number of at least 1/i);
  });

  it("rejects a negative unitCost", async () => {
    await expect(
      runClaimIntake("t1", "u1", base([line({ unitCost: -5000, billedAmount: -5000 })])),
    ).rejects.toThrow(/unit cost must be greater than 0/i);
  });

  it("rejects a zero unitCost", async () => {
    await expect(
      runClaimIntake("t1", "u1", base([line({ unitCost: 0, billedAmount: 0 })])),
    ).rejects.toThrow(/unit cost must be greater than 0/i);
  });

  it("rejects a fractional quantity", async () => {
    await expect(
      runClaimIntake("t1", "u1", base([line({ quantity: 1.5, billedAmount: 1500 })])),
    ).rejects.toThrow(/quantity must be a whole number/i);
  });

  it("rejects an inconsistent billedAmount (≠ qty × unit)", async () => {
    await expect(
      runClaimIntake("t1", "u1", base([line({ quantity: 2, unitCost: 1000, billedAmount: 9999 })])),
    ).rejects.toThrow(/does not equal quantity/i);
  });

  it("rejects an empty line set", async () => {
    await expect(runClaimIntake("t1", "u1", base([]))).rejects.toThrow(/at least one service line/i);
  });
});
