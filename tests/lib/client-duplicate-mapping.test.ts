/**
 * UAT-HF P10.01 — DEF-014.
 *
 * "Submitting an already-used client legal name is correctly refused with no
 * duplicate created, but the entire feedback is 'That client conflicts with an
 * existing record.' Three separate fields are unique-constrained on this form —
 * legal name, code/slug and member-number prefix — and the message does not say
 * which one conflicted, does not name or link the existing record, and does not
 * state what to do next."
 *
 * The field-specific branches already existed. They were unreachable: under
 * Prisma 7 with the pg driver adapter `err.meta.target` is `undefined`, and the
 * constraint moved to `meta.driverAdapterError.cause`. The error shapes below
 * are copied verbatim from a real Postgres, so this test fails if a future
 * adapter moves them again.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { client: { findFirst } } }));

import { isP2002, mapClientP2002 } from "@/app/(admin)/clients/p2002";
import type { ClientActionState } from "@/lib/validation/client";

/**
 * `ClientActionState` is `{ ok: true } | ActionFailure & {...}`, so the failure
 * fields need narrowing. Every case here IS a failure — a mapped P2002 always
 * is — so this asserts that and hands back the failure shape.
 */
function failure(state: ClientActionState | null) {
  expect(state).not.toBeNull();
  expect(state!.ok).toBe(false);
  return state as Extract<ClientActionState, { ok: false }>;
}

/** Exactly what Prisma 7 + @prisma/adapter-pg produced on a real database. */
function adapterP2002(constraintFields: string[], indexName: string) {
  return {
    code: "P2002",
    meta: {
      modelName: "Client",
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          originalCode: "23505",
          originalMessage: `duplicate key value violates unique constraint "${indexName}"`,
          kind: "UniqueConstraintViolation",
          // The adapter quotes each field.
          constraint: { fields: constraintFields.map((f) => `"${f}"`) },
        },
      },
    },
  };
}

/** The pre-adapter shape, which the mapper must keep understanding. */
function legacyP2002(target: string[]) {
  return { code: "P2002", meta: { target } };
}

const ctx = { operatorTenantId: "t1", name: "Acme Ltd", values: { name: "Acme Ltd" } };

beforeEach(() => {
  findFirst.mockReset();
  findFirst.mockResolvedValue(null);
});

describe("P10.01 DEF-014 — the driver-adapter shape is understood", () => {
  it("names the legal name when that is what collided", async () => {
    const mapped = await mapClientP2002(
      adapterP2002(["operatorTenantId", "nameNormalized"], "Client_operatorTenantId_nameNormalized_key"),
      ctx,
    );
    expect(failure(mapped).fieldErrors?.name?.[0]).toMatch(/already exists/i);
    // Not the generic sentence the run was shown. A field-error failure carries
    // no formError at all, which is why this checks the value rather than
    // matching against it.
    expect(failure(mapped).formError).toBeUndefined();
  });

  it("names the slug when that is what collided", async () => {
    const mapped = await mapClientP2002(
      adapterP2002(["operatorTenantId", "slug"], "Client_operatorTenantId_slug_key"),
      ctx,
    );
    expect(failure(mapped).fieldErrors?.slug?.[0]).toMatch(/already in use/i);
    expect(failure(mapped).fieldErrors?.name).toBeUndefined();
  });

  it("names the member-number prefix when that is what collided", async () => {
    const mapped = await mapClientP2002(
      adapterP2002(
        ["operatorTenantId", "memberNumberPrefix"],
        "Client_operatorTenantId_memberNumberPrefix_key",
      ),
      ctx,
    );
    expect(failure(mapped).fieldErrors?.memberNumberPrefix?.[0]).toMatch(/already in use/i);
  });

  it("says what to do next, not just what went wrong", async () => {
    const mapped = await mapClientP2002(
      adapterP2002(["operatorTenantId", "slug"], "Client_operatorTenantId_slug_key"),
      ctx,
    );
    expect(failure(mapped).fieldErrors?.slug?.[0]).toMatch(/enter a unique one/i);
  });

  it("links the existing client when the name collided and it is readable", async () => {
    findFirst.mockResolvedValue({ id: "c-existing", name: "Acme Ltd" });
    const mapped = await mapClientP2002(
      adapterP2002(["operatorTenantId", "nameNormalized"], "Client_operatorTenantId_nameNormalized_key"),
      ctx,
    );
    // The run asked for "which existing record" — tenant-scoped, so this is the
    // operator's own client, not somebody else's.
    expect(failure(mapped).duplicate).toEqual({ id: "c-existing", name: "Acme Ltd" });
    expect(findFirst.mock.calls[0][0].where.operatorTenantId).toBe("t1");
  });
});

describe("P10.01 the fallback still works, in both directions", () => {
  it("still understands the pre-adapter meta.target array", async () => {
    const mapped = await mapClientP2002(legacyP2002(["operatorTenantId", "slug"]), ctx);
    expect(failure(mapped).fieldErrors?.slug?.[0]).toMatch(/already in use/i);
  });

  it("falls back to the index name when only the driver message is present", async () => {
    const err = {
      code: "P2002",
      meta: {
        driverAdapterError: {
          cause: {
            originalMessage:
              'duplicate key value violates unique constraint "Client_operatorTenantId_nameNormalized_key"',
          },
        },
      },
    };
    expect(failure(await mapClientP2002(err, ctx)).fieldErrors?.name?.[0]).toMatch(/already exists/i);
  });

  it("keeps the generic message when nothing identifies the constraint", async () => {
    // Honest: an unrecognised shape must not guess a field.
    const mapped = await mapClientP2002({ code: "P2002", meta: {} }, ctx);
    expect(failure(mapped).formError).toMatch(/conflicts with an existing record/i);
  });

  it("returns null for a non-P2002 so the caller falls through", async () => {
    expect(await mapClientP2002(new Error("something else"), ctx)).toBeNull();
    expect(isP2002({ code: "P2003" })).toBe(false);
    expect(isP2002({ code: "P2002" })).toBe(true);
  });

  it("preserves the typed values so the form is not emptied", async () => {
    const mapped = await mapClientP2002(
      adapterP2002(["operatorTenantId", "slug"], "Client_operatorTenantId_slug_key"),
      ctx,
    );
    expect(failure(mapped).values).toEqual({ name: "Acme Ltd" });
  });
});
