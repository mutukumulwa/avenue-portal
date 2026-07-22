/**
 * Claims Autopilot F2.2 — receipt reservation semantics (unit, mocked prisma).
 * The real-Postgres concurrency proof lives in
 * tests/integration/claim-intake-receipt.integration.test.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  reserveReceipt,
  assertValidScopeKey,
  markReceiptSucceeded,
  markReceiptFailed,
  type ReceiptReservationInput,
} from "@/server/services/claim-intake/receipt";

type Db = Parameters<typeof reserveReceipt>[0];

function p2002() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7.7.0" });
}

const input: ReceiptReservationInput = {
  tenantId: "t1",
  scopeKey: "provider:prv-1",
  channel: "API_V1",
  idempotencyKey: "key-0001",
  schemaVersion: "1",
  requestHash: "req:v1:aaaa",
  strongEventFingerprint: null,
  suspectedDuplicateFingerprint: "suspect:v1:bbbb",
  correlationId: "corr-1",
};

function mockDb(over: {
  create?: ReturnType<typeof vi.fn>;
  findUnique?: ReturnType<typeof vi.fn>;
  updateMany?: ReturnType<typeof vi.fn>;
}) {
  return {
    claimIntakeReceipt: {
      create: over.create ?? vi.fn(),
      findUnique: over.findUnique ?? vi.fn(),
      updateMany: over.updateMany ?? vi.fn(),
    },
  } as unknown as Db;
}

describe("F2.2 — reserveReceipt", () => {
  it("RESERVED when the create succeeds", async () => {
    const created = { id: "r1", ...input, state: "PROCESSING" };
    const db = mockDb({ create: vi.fn(async () => created) });
    const r = await reserveReceipt(db, input);
    expect(r.kind).toBe("RESERVED");
    expect(r.receipt).toBe(created);
  });

  it("REPLAY when the key collides and the request hash matches", async () => {
    const existing = { id: "r1", ...input, state: "PROCESSING" };
    const create = vi.fn(async () => { throw p2002(); });
    const findUnique = vi.fn(async () => existing);
    const r = await reserveReceipt(mockDb({ create, findUnique }), input);
    expect(r.kind).toBe("REPLAY");
    expect(r.receipt).toBe(existing);
  });

  it("CONFLICT when the key collides and the request hash differs — original untouched", async () => {
    const existing = { id: "r1", ...input, requestHash: "req:v1:DIFFERENT", state: "PROCESSING" };
    const create = vi.fn(async () => { throw p2002(); });
    const findUnique = vi.fn(async () => existing);
    const updateMany = vi.fn();
    const r = await reserveReceipt(mockDb({ create, findUnique, updateMany }), input);
    expect(r.kind).toBe("CONFLICT");
    expect(r.receipt).toBe(existing);
    expect(updateMany).not.toHaveBeenCalled(); // never mutates the original
  });

  it("throws retryable when the row vanished after the unique collision", async () => {
    const create = vi.fn(async () => { throw p2002(); });
    const findUnique = vi.fn(async () => null);
    await expect(reserveReceipt(mockDb({ create, findUnique }), input)).rejects.toMatchObject({ kind: "RETRYABLE" });
  });

  it("rethrows a non-unique error unchanged", async () => {
    const boom = new Error("connection reset");
    const create = vi.fn(async () => { throw boom; });
    await expect(reserveReceipt(mockDb({ create }), input)).rejects.toBe(boom);
  });
});

describe("F2.2 — scope-key validation", () => {
  it.each(["user:u1", "provider:prv-1", "device:prv-1:dev-9", "case:case-1", "preauth:pa-1", "reimbursement:m1", "integration:key-1"])(
    "accepts %s",
    (k) => expect(() => assertValidScopeKey(k)).not.toThrow(),
  );
  it.each(["", "bogus", "user:", "user with space", "admin:u1", "provider:has space"])(
    "rejects %s",
    (k) => expect(() => assertValidScopeKey(k)).toThrow(),
  );
});

describe("F2.2 — conditional terminal transitions", () => {
  it("marks SUCCEEDED only from PROCESSING (count 1 ⇒ true)", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    expect(await markReceiptSucceeded(mockDb({ updateMany }), "r1", { outcomeCode: "ACCEPTED" })).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "r1", state: "PROCESSING" } }));
  });

  it("a late loser cannot overwrite a terminal state (count 0 ⇒ false)", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    expect(await markReceiptFailed(mockDb({ updateMany }), "r1", { outcomeCode: "INTERNAL_ERROR" })).toBe(false);
  });
});
