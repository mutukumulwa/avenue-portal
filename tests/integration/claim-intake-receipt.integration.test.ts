/**
 * Claims Autopilot F2.2 — receipt reservation REAL-Postgres concurrency proof.
 *
 * OPT-IN (never touches a real DB): runs only when
 *   AUTOPILOT_TEST_DB = postgres URL of a THROWAWAY database
 *   DATABASE_URL      = the same URL (services read @/lib/prisma at import)
 * See docs/claims-autopilot/VERIFICATION.md for the provisioning recipe.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClaimIntakeChannel } from "@prisma/client";
import {
  reserveReceipt,
  markReceiptSucceeded,
  markReceiptFailed,
  type ReceiptReservationInput,
  type ReservationResult,
} from "@/server/services/claim-intake/receipt";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F2.2 integration — receipt reservation under real concurrency", () => {
  // Deferred so mocked-prisma unit suites never construct a client.
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const t = await prisma.tenant.create({ data: { name: "AP Receipt Test", slug: `ap-rcpt-${Date.now()}` } });
    tenantId = t.id;
  });

  afterAll(async () => {
    if (prisma && tenantId) {
      await prisma.claimIntakeReceipt.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
      await prisma.$disconnect();
    }
  });

  const input = (over: Partial<ReceiptReservationInput>): ReceiptReservationInput => ({
    tenantId,
    scopeKey: "provider:prv-1",
    channel: ClaimIntakeChannel.API_V1,
    idempotencyKey: "key",
    schemaVersion: "1",
    requestHash: "req:v1:base",
    strongEventFingerprint: null,
    suspectedDuplicateFingerprint: "suspect:v1:base",
    correlationId: "corr",
    ...over,
  });

  it("20 concurrent same key + same hash reserve exactly ONE receipt (19 replays)", async () => {
    const idempotencyKey = `conc-same-${Date.now()}`;
    const results = await Promise.all(
      Array.from({ length: 20 }, () => reserveReceipt(prisma, input({ idempotencyKey }))),
    );
    expect(results.filter((r) => r.kind === "RESERVED")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "REPLAY")).toHaveLength(19);
    expect(await prisma.claimIntakeReceipt.count({ where: { tenantId, idempotencyKey } })).toBe(1);
  });

  it("concurrent same key + DIFFERENT hash → one reserved, rest CONFLICT, original never overwritten", async () => {
    const idempotencyKey = `conc-diff-${Date.now()}`;
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => reserveReceipt(prisma, input({ idempotencyKey, requestHash: `req:v1:h${i}` }))),
    );
    const reserved = results.filter((r): r is Extract<ReservationResult, { kind: "RESERVED" }> => r.kind === "RESERVED");
    const conflict = results.filter((r) => r.kind === "CONFLICT");
    expect(reserved).toHaveLength(1);
    expect(conflict).toHaveLength(9);
    const rows = await prisma.claimIntakeReceipt.findMany({ where: { tenantId, idempotencyKey } });
    expect(rows).toHaveLength(1);
    // The single surviving row is the winner's; its hash was never overwritten by a loser.
    expect(rows[0].requestHash).toBe(reserved[0].receipt.requestHash);
    for (const c of conflict) expect(c.receipt.id).toBe(rows[0].id);
  });

  it("terminal transition is one-way: a committed SUCCESS survives a late FAILURE attempt", async () => {
    const idempotencyKey = `terminal-${Date.now()}`;
    const r = await reserveReceipt(prisma, input({ idempotencyKey }));
    expect(r.kind).toBe("RESERVED");
    expect(await markReceiptSucceeded(prisma, r.receipt.id, { outcomeCode: "ACCEPTED", httpStatus: 201 })).toBe(true);
    expect(await markReceiptFailed(prisma, r.receipt.id, { outcomeCode: "INTERNAL_ERROR" })).toBe(false);
    const row = await prisma.claimIntakeReceipt.findUniqueOrThrow({ where: { id: r.receipt.id } });
    expect(row.state).toBe("SUCCEEDED");
    expect(row.outcomeCode).toBe("ACCEPTED");
  });
});
