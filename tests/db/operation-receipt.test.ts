/**
 * UAT-HF P01.02 — durable operation receipts.
 *
 * Acceptance, verbatim from the plan: "simulate a response loss after commit,
 * reopen by operation ID, and prove exactly one entity exists and its status is
 * discoverable."
 *
 * That is DEF-065 reproduced deliberately: the run's server returned 200 and
 * created UX26-2026-00037 while the operator saw only a crash, with no way to find
 * out. The test below commits a real row, throws away the "response", retries with
 * the same operation id, and asserts a REPLAY plus exactly one row.
 *
 * OPT-IN — runs only when BOTH are set (so it can never touch a real/prod DB):
 *   RECEIPT_TEST_DB = postgres URL of a THROWAWAY database
 *   DATABASE_URL    = the same URL (services read @/lib/prisma at import)
 *
 * Driver (on a disposable DB that has had `prisma migrate deploy`):
 *   RECEIPT_TEST_DB=postgresql://user@127.0.0.1:5432/throwaway \
 *   DATABASE_URL=$RECEIPT_TEST_DB \
 *   npx vitest run tests/db/operation-receipt.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { canonicalize, hashRequest } from "@/server/services/operation-receipt.service";

const DB_URL = process.env.RECEIPT_TEST_DB;
const URL_SET = !!DB_URL && process.env.DATABASE_URL === DB_URL;

// ── pure, always runs ────────────────────────────────────────────────────────
describe("P01.02 request canonicalisation", () => {
  it("hashes the same regardless of key order, at every depth", () => {
    const a = { b: 2, a: 1, nested: { y: "2", x: "1" } };
    const b = { a: 1, nested: { x: "1", y: "2" }, b: 2 };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(hashRequest(a)).toBe(hashRequest(b));
  });

  it("distinguishes a genuinely different payload", () => {
    expect(hashRequest({ name: "Amina" })).not.toBe(hashRequest({ name: "Aminah" }));
  });

  it("does not confuse a missing key with an explicitly undefined one", () => {
    // JSON drops undefined, so these ARE the same request.
    expect(hashRequest({ a: 1, b: undefined })).toBe(hashRequest({ a: 1 }));
    // ...but null is a real value.
    expect(hashRequest({ a: 1, b: null })).not.toBe(hashRequest({ a: 1 }));
  });

  it("preserves array order, which is meaningful", () => {
    expect(hashRequest({ ids: ["a", "b"] })).not.toBe(hashRequest({ ids: ["b", "a"] }));
  });
});

// ── real database ────────────────────────────────────────────────────────────
describe.skipIf(!URL_SET)("P01.02 operation receipts (opt-in DB)", () => {
  let prisma: (typeof import("@/lib/prisma"))["prisma"];
  let Receipts: (typeof import("@/server/services/operation-receipt.service"))["OperationReceiptService"];

  const TENANT = "t-receipt-uathf";
  const OTHER_TENANT = "t-receipt-other-uathf";
  const ACTOR = "u-receipt-uathf";
  const OP = "packages.create";

  const request = { name: "UX Receipt Package", annualLimit: 300000 };

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    ({ OperationReceiptService: Receipts } = await import("@/server/services/operation-receipt.service"));
    for (const id of [TENANT, OTHER_TENANT]) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Tenant" ("id","name","slug","updatedAt") VALUES ($1,$1,$1, now()) ON CONFLICT ("id") DO NOTHING`,
        id,
      );
    }
  });

  beforeEach(async () => {
    await prisma.operationReceipt.deleteMany({ where: { tenantId: { in: [TENANT, OTHER_TENANT] } } });
    await prisma.package.deleteMany({ where: { tenantId: { in: [TENANT, OTHER_TENANT] } } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.operationReceipt.deleteMany({ where: { tenantId: { in: [TENANT, OTHER_TENANT] } } }).catch(() => {});
    await prisma.package.deleteMany({ where: { tenantId: { in: [TENANT, OTHER_TENANT] } } }).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE "id" = ANY($1::text[])`, [TENANT, OTHER_TENANT]).catch(
      () => {},
    );
    await prisma.$disconnect?.();
  });

  const reserve = (idempotencyKey: string, req: unknown = request) =>
    Receipts.reserve({ tenantId: TENANT, actorId: ACTOR, operationType: OP, idempotencyKey, request: req });

  /** The business write, committed together with its receipt — the required pattern. */
  async function createPackageWithReceipt(receiptId: string, name: string) {
    return prisma.$transaction(async (tx) => {
      const pkg = await tx.package.create({
        data: { tenantId: TENANT, name, annualLimit: 300000, contributionAmount: 12000 },
      });
      await Receipts.succeed(receiptId, { entityType: "Package", entityId: pkg.id, entityRef: name }, tx);
      return pkg;
    });
  }

  it("reserves a fresh key", async () => {
    const outcome = await reserve("op_fresh");
    expect(outcome.status).toBe("RESERVED");
    expect(outcome.receipt.state).toBe("PROCESSING");
  });

  it("refuses to write again while an attempt is still in flight (the double-click)", async () => {
    await reserve("op_inflight");
    const second = await reserve("op_inflight");
    expect(second.status).toBe("IN_PROGRESS");
  });

  it("treats the same key with a DIFFERENT payload as a conflict, not a replay", async () => {
    await reserve("op_reused");
    const second = await reserve("op_reused", { name: "Something else entirely" });
    expect(second.status).toBe("CONFLICT");
  });

  it("allows a retry only after a provably FAILED attempt", async () => {
    const first = await reserve("op_failed");
    await Receipts.markFailed(first.receipt.id, "UNAVAILABLE");
    const retry = await reserve("op_failed");
    expect(retry.status).toBe("RESERVED");
    expect(retry.receipt.state).toBe("PROCESSING");
  });

  it("NEVER auto-retries after an UNKNOWN outcome", async () => {
    const first = await reserve("op_unknown");
    await Receipts.markUnknown(first.receipt.id);
    const retry = await reserve("op_unknown");
    // The whole point: a retry here could double-write, so it must not be reserved.
    expect(retry.status).toBe("UNKNOWN_PRIOR");
  });

  // ── the acceptance test ────────────────────────────────────────────────────
  it("a response lost AFTER commit replays, leaves exactly one entity, and is discoverable", async () => {
    const KEY = "op_lost_response";

    // Attempt 1 — commits for real, then the response never reaches the client.
    const first = await reserve(KEY);
    expect(first.status).toBe("RESERVED");
    await createPackageWithReceipt(first.receipt.id, "UX26-RECEIPT-0001");
    // ...client sees a network error and knows nothing.

    // Attempt 2 — the operator resubmits the same draft, so the same operation id.
    const second = await reserve(KEY);
    expect(second.status).toBe("REPLAY");
    expect(second.receipt.entityRef).toBe("UX26-RECEIPT-0001");

    // Exactly one entity exists. This is the assertion DEF-065 needed.
    const packages = await prisma.package.findMany({ where: { tenantId: TENANT } });
    expect(packages).toHaveLength(1);

    // And the outcome is discoverable by the opaque operation id alone.
    const status = await Receipts.lookup({ tenantId: TENANT, idempotencyKey: KEY });
    expect(status).toMatchObject({
      operationId: KEY,
      operationType: OP,
      state: "SUCCEEDED",
      entityRef: "UX26-RECEIPT-0001",
      resultCode: "OK",
    });
    expect(status?.completedAt).toBeInstanceOf(Date);
  });

  it("a rolled-back write leaves no entity and no false success", async () => {
    const reserved = await reserve("op_rollback");
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.package.create({
          data: { tenantId: TENANT, name: "UX26-RECEIPT-ROLLBACK", annualLimit: 1, contributionAmount: 1 },
        });
        await Receipts.succeed(reserved.receipt.id, { entityRef: "UX26-RECEIPT-ROLLBACK" }, tx);
        throw new Error("boom after both writes");
      }),
    ).rejects.toThrow("boom");

    // Receipt and entity roll back together — the receipt cannot claim a success
    // for a write that did not survive.
    expect(await prisma.package.count({ where: { tenantId: TENANT } })).toBe(0);
    const receipt = await prisma.operationReceipt.findUnique({ where: { id: reserved.receipt.id } });
    expect(receipt?.state).toBe("PROCESSING");
    expect(receipt?.entityRef).toBeNull();
  });

  it("concurrent reservations of one key yield exactly one winner", async () => {
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => reserve("op_race")));
    expect(outcomes.filter((o) => o.status === "RESERVED")).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "IN_PROGRESS")).toHaveLength(7);
    expect(await prisma.operationReceipt.count({ where: { tenantId: TENANT, idempotencyKey: "op_race" } })).toBe(1);
  });

  it("the status lookup is tenant-scoped", async () => {
    const KEY = "op_scoped";
    const r = await reserve(KEY);
    await Receipts.succeed(r.receipt.id, { entityRef: "UX26-RECEIPT-SCOPED" });

    expect(await Receipts.lookup({ tenantId: TENANT, idempotencyKey: KEY })).not.toBeNull();
    expect(await Receipts.lookup({ tenantId: OTHER_TENANT, idempotencyKey: KEY })).toBeNull();
  });

  it("the status projection carries no request hash or payload", async () => {
    const KEY = "op_projection";
    const r = await reserve(KEY);
    await Receipts.succeed(r.receipt.id, { entityRef: "UX26-RECEIPT-PROJ" });

    const status = await Receipts.lookup({ tenantId: TENANT, idempotencyKey: KEY });
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(hashRequest(request));
    expect(serialized).not.toContain("requestHash");
    expect(serialized).not.toContain("UX Receipt Package"); // the payload itself
  });
});
