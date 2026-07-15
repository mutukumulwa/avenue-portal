/**
 * FG-C5 (point-in-time eligibility, under-block half): a claim whose service
 * date falls BEFORE the member's coverage start (`enrollmentDate`) must be
 * rejected at intake — the member was not covered on that date. The prior
 * current-status-only check let pre-coverage claims through.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ClaimIntakeInput } from "@/server/services/claim-intake";

const prismaMock = vi.hoisted(() => ({
  member: { findUnique: vi.fn() },
  provider: { findUnique: vi.fn(async () => null) }, // gate is reached before this
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));

import { runClaimIntake } from "@/server/services/claim-intake";

const activeMember = (enrollmentDate: string) => ({
  id: "m1",
  tenantId: "t1",
  status: "ACTIVE",
  firstName: "Kenneth",
  lastName: "Kamau",
  enrollmentDate: new Date(enrollmentDate),
  group: { status: "ACTIVE", name: "Safaricom" },
});

const input = (dateOfService: string): ClaimIntakeInput => ({
  memberId: "m1",
  providerId: "p1",
  serviceType: "OUTPATIENT" as never,
  benefitCategory: "OUTPATIENT" as never,
  dateOfService,
  diagnoses: [{ code: "I10", description: "Hypertension", standardCharge: null, isPrimary: true }],
  lineItems: [
    { serviceCategory: "OTHER" as never, cptCode: "", description: "Consult", icdCode: "I10", quantity: 1, unitCost: 3500, billedAmount: 3500 },
  ],
});

beforeEach(() => vi.clearAllMocks());

describe("runClaimIntake — coverage-start gate (FG-C5)", () => {
  it("rejects a service date before the member's enrollmentDate", async () => {
    prismaMock.member.findUnique.mockResolvedValue(activeMember("2026-06-01"));
    await expect(runClaimIntake("t1", "u1", input("2026-01-15"))).rejects.toThrow(
      /before .* coverage start|not covered on that date/i,
    );
  });

  it("does NOT block a service date on/after coverage start (gate passes; fails later, not on coverage)", async () => {
    prismaMock.member.findUnique.mockResolvedValue(activeMember("2026-06-01"));
    // dateOfService == enrollmentDate → passes the gate; provider is null → a
    // DIFFERENT error, proving the coverage gate did not fire.
    await expect(runClaimIntake("t1", "u1", input("2026-06-01"))).rejects.toThrow(/Provider not found/i);
  });
});
