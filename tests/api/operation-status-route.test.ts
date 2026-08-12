/**
 * UAT-HF P01.02 — /api/operations/[operationId] authorization and privacy.
 *
 * This endpoint is the answer to "did my submit land?" (DEF-065), so it is also a
 * tempting probe surface. The run had already found identifiers travelling in
 * URLs (DEF-057 "member number reflected in the query string", DEF-079) and a
 * uniqueness error that named an unrelated member (DEF-027/078).
 *
 * These tests pin the three properties that keep it safe:
 *   * only an authenticated caller, scoped to their OWN tenant and operations;
 *   * a business identifier cannot be used as the key at all — the opaque shape
 *     is validated, so "NWSC-2026-00001" is rejected before any query runs;
 *   * an operation that is not yours is 404, never 403, so existence is not
 *     confirmed.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const sessionHolder = vi.hoisted(() => ({ session: null as unknown }));
const receipts = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: async () => sessionHolder.session }));
vi.mock("@/server/services/operation-receipt.service", () => ({
  OperationReceiptService: receipts,
}));

import { GET } from "@/app/api/operations/[operationId]/route";

const OP_ID = "op_3f2b1c8e-0000-4000-8000-abcdef012345";

const call = (operationId: string) =>
  GET(new Request(`https://x/api/operations/${operationId}`), {
    params: Promise.resolve({ operationId }),
  });

const signedIn = { user: { id: "u1", tenantId: "t1", role: "MEMBER_OPS" } };

beforeEach(() => {
  vi.clearAllMocks();
  sessionHolder.session = signedIn;
  receipts.lookup.mockResolvedValue(null);
});

describe("P01.02 GET /api/operations/[operationId]", () => {
  it("401s without a session, before touching the database", async () => {
    sessionHolder.session = null;
    const res = await call(OP_ID);
    expect(res.status).toBe(401);
    expect(receipts.lookup).not.toHaveBeenCalled();
  });

  it("401s when the session carries no tenant", async () => {
    sessionHolder.session = { user: { id: "u1" } };
    expect((await call(OP_ID)).status).toBe(401);
    expect(receipts.lookup).not.toHaveBeenCalled();
  });

  it.each([
    ["NWSC-2026-00001", "a member number"],
    ["UX26-2026-00017", "a controlled-scheme member number"],
    ["amina@example.com", "an email address"],
    ["CM12345678", "a national ID"],
    ["cor_3f2b1c8e", "a correlation id, which is not an operation id"],
  ])("400s on %s (%s) without querying anything", async (key) => {
    const res = await call(key);
    expect(res.status).toBe(400);
    // The point: a business identifier can never be used to probe this endpoint.
    expect(receipts.lookup).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the caller's own tenant AND actor", async () => {
    await call(OP_ID);
    expect(receipts.lookup).toHaveBeenCalledWith({
      tenantId: "t1",
      actorId: "u1",
      idempotencyKey: OP_ID,
    });
  });

  it("404s — not 403 — for an operation that is not the caller's", async () => {
    receipts.lookup.mockResolvedValue(null);
    const res = await call(OP_ID);
    // A 403 would confirm the id exists for somebody else.
    expect(res.status).toBe(404);
  });

  it("returns the safe projection and forbids caching", async () => {
    receipts.lookup.mockResolvedValue({
      operationId: OP_ID,
      operationType: "members.create",
      state: "SUCCEEDED",
      entityRef: "UX26-2026-00017",
      entityType: "Member",
      entityId: "m1",
      resultCode: "OK",
      createdAt: new Date("2026-08-12T09:00:00Z"),
      completedAt: new Date("2026-08-12T09:00:01Z"),
    });

    const res = await call(OP_ID);
    expect(res.status).toBe(200);
    // A stale "still processing" could make someone resubmit — exactly the
    // duplicate this whole mechanism exists to prevent.
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const body = await res.json();
    expect(body).toMatchObject({ state: "SUCCEEDED", entityRef: "UX26-2026-00017" });
    // Never the payload or its hash.
    expect(JSON.stringify(body)).not.toContain("requestHash");
  });
});
