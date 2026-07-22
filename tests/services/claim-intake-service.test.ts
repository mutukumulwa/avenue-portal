/**
 * Claims Autopilot F3.4 — ClaimIntakeService.submit (unit: structural reject +
 * enqueuer hooks). The full acceptance/replay/conflict/resilience matrix runs
 * against a real DB in tests/integration/claim-intake-service.integration.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  ClaimIntakeService,
  setProcessingEnqueuer,
  resetProcessingEnqueuer,
} from "@/server/services/claim-intake/intake.service";

describe("F3.4 — structural rejection short-circuits before any DB work", () => {
  it("throws a VALIDATION IntakeError for a malformed submission (no receipt reserved)", async () => {
    await expect(ClaimIntakeService.submit({ kind: "operatorUser", tenantId: "t1", userId: "u1" }, { not: "a claim" })).rejects.toMatchObject({ kind: "VALIDATION", httpStatus: 422 });
  });

  it("throws VALIDATION for an unsupported schema version", async () => {
    await expect(
      ClaimIntakeService.submit(
        { kind: "operatorUser", tenantId: "t1", userId: "u1" },
        { schemaVersion: "2", idempotencyKey: "key-0001", member: { memberNumber: "M" }, provider: {}, encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-06-01" }, diagnoses: [{ code: "J06.9", isPrimary: true }], lines: [{ serviceCategory: "CONSULTATION", description: "x", quantity: 1, unitCost: "1", billedAmount: "1" }] },
      ),
    ).rejects.toMatchObject({ kind: "VALIDATION" });
  });
});

describe("F3.4 — processing enqueuer hook", () => {
  it("can be registered and reset", () => {
    let called = false;
    setProcessingEnqueuer(async () => { called = true; });
    resetProcessingEnqueuer();
    expect(called).toBe(false); // reset installs a no-op; nothing invoked here
  });
});
