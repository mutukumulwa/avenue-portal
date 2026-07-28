/**
 * F6.7 — provider disbursement state machine (pure) + schema round-trip (opt-in DB).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  DISBURSEMENT_TRANSITIONS,
  DISBURSEMENT_TERMINAL_STATUSES,
  DISBURSEMENT_TRANSITION_ACTOR,
  canTransitionDisbursement,
  assertDisbursementTransition,
  isDisbursementTerminal,
  isSuccessfulDisbursement,
  DisbursementTransitionError,
} from "@/server/services/provider-disbursement/state-machine";

describe("F6.7 disbursement state machine (pure)", () => {
  it("allows the forward payment lifecycle", () => {
    expect(canTransitionDisbursement("PENDING", "RELEASED")).toBe(true);
    expect(canTransitionDisbursement("RELEASED", "PROCESSING")).toBe(true);
    expect(canTransitionDisbursement("PROCESSING", "SUCCEEDED")).toBe(true);
    expect(canTransitionDisbursement("SUCCEEDED", "REVERSED")).toBe(true);
  });
  it("allows failure from the pre-success states", () => {
    for (const from of ["PENDING", "RELEASED", "PROCESSING"] as const) {
      expect(canTransitionDisbursement(from, "FAILED")).toBe(true);
    }
  });
  it("FAILED and REVERSED are terminal", () => {
    expect(DISBURSEMENT_TERMINAL_STATUSES).toEqual(["FAILED", "REVERSED"]);
    expect(DISBURSEMENT_TRANSITIONS.FAILED).toEqual([]);
    expect(DISBURSEMENT_TRANSITIONS.REVERSED).toEqual([]);
    expect(isDisbursementTerminal("FAILED")).toBe(true);
    expect(isDisbursementTerminal("SUCCEEDED")).toBe(false);
  });
  it("forbids skipping or resurrecting states", () => {
    expect(canTransitionDisbursement("PENDING", "SUCCEEDED")).toBe(false); // no skipping
    expect(canTransitionDisbursement("SUCCEEDED", "PROCESSING")).toBe(false); // no going back
    expect(canTransitionDisbursement("FAILED", "RELEASED")).toBe(false); // retry = new record
    expect(canTransitionDisbursement("REVERSED", "SUCCEEDED")).toBe(false);
  });
  it("assertDisbursementTransition throws on an illegal move", () => {
    expect(() => assertDisbursementTransition("PENDING", "REVERSED")).toThrow(DisbursementTransitionError);
    expect(() => assertDisbursementTransition("PENDING", "RELEASED")).not.toThrow();
  });
  it("only SUCCEEDED counts as an actual payment (I5 leg) — REVERSED does not", () => {
    expect(isSuccessfulDisbursement("SUCCEEDED")).toBe(true);
    expect(isSuccessfulDisbursement("REVERSED")).toBe(false);
    expect(isSuccessfulDisbursement("PROCESSING")).toBe(false);
  });
  it("maker/checker model: release=MAKER, confirm=CHECKER, reversal=CHECKER, failure=SYSTEM", () => {
    expect(DISBURSEMENT_TRANSITION_ACTOR.RELEASED).toBe("MAKER");
    expect(DISBURSEMENT_TRANSITION_ACTOR.SUCCEEDED).toBe("CHECKER");
    expect(DISBURSEMENT_TRANSITION_ACTOR.REVERSED).toBe("CHECKER");
    expect(DISBURSEMENT_TRANSITION_ACTOR.FAILED).toBe("SYSTEM");
  });
});

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F6.7 ProviderDisbursement schema (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let world: import("../factories/provider-network").ProviderWorld;
  let batchId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    const b = await world.createSettlementBatch({ providerId: world.providers.a.id, claims: [{ billed: 1000, approved: 1000, lines: [{ billed: 1000, approved: 1000 }] }] });
    batchId = b.batch.id;
  });
  afterAll(async () => { if (world) await world.teardown(); });

  it("persists disbursement facts incl. masked destination + defaults", async () => {
    const d = await world.createDisbursement({ batchId, status: "SUCCEEDED", amount: 1000, method: "BANK_TRANSFER", maskedDestination: "***4321", externalReference: "FT-2026-001", idempotencyKey: "disb-A" });
    const row = await prisma.providerDisbursement.findUnique({ where: { id: d.id } });
    expect(row!.status).toBe("SUCCEEDED");
    expect(Number(row!.amount)).toBe(1000);
    expect(row!.currency).toBe("UGX");
    expect(row!.maskedDestination).toBe("***4321");
    expect(row!.externalReference).toBe("FT-2026-001");
    expect(row!.reconciliationStatus).toBe("UNRECONCILED"); // default
    expect(row!.version).toBe(1);
  });

  it("separates safe vs internal failure reasons (§9)", async () => {
    const d = await prisma.providerDisbursement.create({
      data: { tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, settlementBatchId: batchId, status: "FAILED", amount: 500, currency: "UGX", baseAmount: 500, failureReasonSafe: "Payment could not be completed; please confirm your bank details.", failureReasonInternal: "Beneficiary account frozen — compliance hold #77" },
    });
    const row = await prisma.providerDisbursement.findUnique({ where: { id: d.id } });
    expect(row!.failureReasonSafe).toMatch(/confirm your bank details/);
    expect(row!.failureReasonInternal).toMatch(/compliance hold/);
    expect(row!.failureReasonSafe).not.toContain("compliance");
  });

  it("idempotency: a duplicate (tenant, idempotencyKey) is rejected", async () => {
    await world.createDisbursement({ batchId, amount: 100, idempotencyKey: "disb-dup" });
    await expect(world.createDisbursement({ batchId, amount: 100, idempotencyKey: "disb-dup" })).rejects.toMatchObject({ code: "P2002" });
  });

  it("allows split/partial disbursements on one batch (no batch-level unique; null keys distinct)", async () => {
    const a = await world.createDisbursement({ batchId, amount: 600 });
    const b = await world.createDisbursement({ batchId, amount: 400 });
    expect(a.id).not.toBe(b.id);
    const count = await prisma.providerDisbursement.count({ where: { settlementBatchId: batchId } });
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
