/**
 * Claims Autopilot F2.1 — data-model shape guard for ClaimIntakeReceipt.
 *
 * Proves the additive schema generated the expected model, enums, fields and the
 * (tenant, scopeKey, channel, idempotencyKey) compound unique. Compile-time
 * assertions (the typed inputs below) are enforced by `npm run typecheck`;
 * runtime assertions cover the enums and field set.
 */
import { describe, it, expect } from "vitest";
import { Prisma, ClaimIntakeChannel, ClaimIntakeReceiptState } from "@prisma/client";

describe("F2.1 — ClaimIntakeReceipt data model", () => {
  it("exposes the ClaimIntakeChannel enum with all 12 channels", () => {
    expect(Object.values(ClaimIntakeChannel).sort()).toEqual(
      [
        "ADMIN_PORTAL", "API_V1", "CASE_FINAL", "CASE_INTERIM", "CSV_IMPORT",
        "OFFLINE_SYNC", "PREAUTH_CONVERSION", "PROVIDER_PORTAL", "REIMBURSEMENT",
        "SLADE360", "SMART", "TRPC",
      ].sort(),
    );
  });

  it("exposes the ClaimIntakeReceiptState enum", () => {
    expect(Object.values(ClaimIntakeReceiptState).sort()).toEqual(["FAILED", "PROCESSING", "REJECTED", "SUCCEEDED"]);
  });

  it("registers the model with the required fields", () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "ClaimIntakeReceipt");
    expect(model, "ClaimIntakeReceipt model must exist").toBeDefined();
    const fieldNames = new Set(model!.fields.map((f) => f.name));
    for (const f of [
      "id", "tenantId", "scopeKey", "channel", "idempotencyKey", "schemaVersion",
      "requestHash", "strongEventFingerprint", "suspectedDuplicateFingerprint",
      "claimId", "state", "outcomeCode", "safeMessage", "httpStatus", "correlationId",
      "replayedFromReceiptId", "createdAt", "completedAt", "updatedAt",
    ]) {
      expect(fieldNames.has(f), `field ${f}`).toBe(true);
    }
  });

  it("has a compound unique (tenantId, scopeKey, channel, idempotencyKey) — compile-time proof", () => {
    // If this compound key name did not exist, typecheck would fail.
    const whereUnique: Prisma.ClaimIntakeReceiptWhereUniqueInput = {
      tenantId_scopeKey_channel_idempotencyKey: {
        tenantId: "t1",
        scopeKey: "provider:prv-1",
        channel: ClaimIntakeChannel.API_V1,
        idempotencyKey: "key-0001",
      },
    };
    expect(whereUnique.tenantId_scopeKey_channel_idempotencyKey?.channel).toBe("API_V1");
  });

  it("accepts a well-typed create input (compile-time proof of field types)", () => {
    const create: Prisma.ClaimIntakeReceiptUncheckedCreateInput = {
      tenantId: "t1",
      scopeKey: "user:u1",
      channel: ClaimIntakeChannel.ADMIN_PORTAL,
      idempotencyKey: "key-0002",
      schemaVersion: "1",
      requestHash: "req:v1:" + "0".repeat(64),
      suspectedDuplicateFingerprint: "suspect:v1:" + "0".repeat(64),
      correlationId: "corr-1",
      state: ClaimIntakeReceiptState.PROCESSING,
    };
    expect(create.state).toBe("PROCESSING");
    // strongEventFingerprint and claimId are optional (nullable).
    expect(create.strongEventFingerprint).toBeUndefined();
    expect(create.claimId).toBeUndefined();
  });
});
