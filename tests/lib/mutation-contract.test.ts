/**
 * UAT-HF P01.01 — the mutation envelope contract.
 *
 * These tests pin the two properties the human-factors run actually needed:
 *   * an unrecognised failure is UNKNOWN_OUTCOME, never a confident "it failed"
 *     that invites a duplicate submit (DEF-065);
 *   * no raw exception text or database detail reaches the client (DEF-027/078).
 */
import { describe, it, expect, vi } from "vitest";
import {
  DomainError,
  OPERATION_ID_FIELD,
  fromActionFailure,
  isControlFlowError,
  isMutationFailure,
  isMutationResult,
  mutationFail,
  mutationOk,
  toMutationFailure,
  type MutationFailureKind,
} from "@/lib/mutation-contract";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { isCorrelationId, isOperationId, newCorrelationId, newOperationId } from "@/lib/correlation";

const ALL_KINDS: MutationFailureKind[] = [
  "VALIDATION",
  "CONFLICT",
  "FORBIDDEN",
  "UNAVAILABLE",
  "UNKNOWN_OUTCOME",
];

/** A Prisma-shaped error: the mapper keys off `.code`. */
const prismaErr = (code: string) => Object.assign(new Error(`raw prisma text for ${code}`), { code });

describe("P01.01 correlation ids", () => {
  it("mints distinct, prefixed, opaque ids", () => {
    const a = newCorrelationId();
    const b = newCorrelationId();
    expect(a).not.toBe(b);
    expect(isCorrelationId(a)).toBe(true);
    expect(isOperationId(newOperationId())).toBe(true);
    // An operation id is not a correlation id and vice versa.
    expect(isCorrelationId(newOperationId())).toBe(false);
    expect(isOperationId(newCorrelationId())).toBe(false);
  });
});

describe("P01.01 envelope construction", () => {
  it("success carries an operation id and defaults replayed to false", () => {
    const result = mutationOk("op_1", { entityRef: "UX26-2026-00017", nextAction: "View member" });
    expect(result).toMatchObject({
      ok: true,
      operationId: "op_1",
      replayed: false,
      entityRef: "UX26-2026-00017",
      nextAction: "View member",
    });
  });

  it("marks a replay explicitly, so the UI can say 'already saved' not 'saved'", () => {
    expect(mutationOk("op_1", { replayed: true }).replayed).toBe(true);
  });

  it.each(ALL_KINDS)("%s failure always carries a quotable correlation id", (kind) => {
    const failure = mutationFail(kind);
    expect(isCorrelationId(failure.correlationId)).toBe(true);
    expect(failure.message.length).toBeGreaterThan(0);
  });

  it("mirrors message into formError so existing ActionResult consumers keep rendering", () => {
    const failure = mutationFail("CONFLICT", { message: "Changed under you." });
    expect(failure.formError).toBe("Changed under you.");

    // Structurally usable anywhere an ActionResult is expected.
    const asAction: ActionResult<void> = failure;
    expect(asAction.ok).toBe(false);
  });

  it("UNKNOWN_OUTCOME can never be marked retryable, even when the caller asks", () => {
    expect(mutationFail("UNKNOWN_OUTCOME", { retryable: true }).retryable).toBe(false);
  });

  it("only UNAVAILABLE is retryable by default", () => {
    for (const kind of ALL_KINDS) {
      expect(mutationFail(kind).retryable, kind).toBe(kind === "UNAVAILABLE");
    }
  });

  it("drops an empty fieldErrors map so consumers can rely on presence", () => {
    expect(mutationFail("VALIDATION", { fieldErrors: {} }).fieldErrors).toBeUndefined();
  });

  it("recognises envelopes and plain ActionResults apart", () => {
    expect(isMutationResult(mutationOk("op_1"))).toBe(true);
    expect(isMutationResult(mutationFail("CONFLICT"))).toBe(true);
    expect(isMutationResult(ok())).toBe(false);
    expect(isMutationResult(fail({ name: ["required"] }))).toBe(false);
    expect(isMutationFailure(null)).toBe(false);
  });

  it("adapts a legacy ActionFailure without losing its field errors", () => {
    const adapted = fromActionFailure(fail({ name: ["Required"] }, "Check the form"));
    expect(adapted.kind).toBe("VALIDATION");
    expect(adapted.message).toBe("Check the form");
    expect(adapted.fieldErrors).toEqual({ name: ["Required"] });
  });

  it("exposes the operation-id field name shared with the client hook", () => {
    expect(OPERATION_ID_FIELD).toBe("__operationId");
  });
});

describe("P01.01 control-flow errors must propagate", () => {
  it("detects Next redirect/notFound by digest and by message", () => {
    expect(isControlFlowError(Object.assign(new Error("x"), { digest: "NEXT_REDIRECT;replace;/x;307;" }))).toBe(true);
    expect(isControlFlowError(Object.assign(new Error("x"), { digest: "NEXT_NOT_FOUND" }))).toBe(true);
    expect(isControlFlowError(new Error("NEXT_REDIRECT"))).toBe(true);
    expect(isControlFlowError(new Error("something else"))).toBe(false);
  });

  it("rethrows rather than converting a redirect into a fake failure", () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/x;307;" });
    expect(() => toMutationFailure(redirect, { operation: "test", log: () => {} })).toThrow(redirect);
  });
});

describe("P01.01 error mapping", () => {
  const log = () => {};

  it.each([
    ["P2002", "CONFLICT"], // unique violation
    ["P2025", "CONFLICT"], // record not found on update — a stale write
    ["P2034", "CONFLICT"], // write conflict / deadlock
    ["P2003", "VALIDATION"], // foreign key
    ["P2000", "VALIDATION"], // value too long
    ["P2006", "VALIDATION"], // invalid field value
    ["P1001", "UNAVAILABLE"], // cannot reach database
    ["P1002", "UNAVAILABLE"],
    ["P1008", "UNAVAILABLE"],
    ["P1017", "UNAVAILABLE"],
  ])("maps Prisma %s to %s", (code, expected) => {
    expect(toMutationFailure(prismaErr(code), { operation: "t", log }).kind).toBe(expected);
  });

  it("maps a ZodError to VALIDATION", () => {
    const zod = Object.assign(new Error("bad"), { name: "ZodError", issues: [{ path: ["name"] }] });
    expect(toMutationFailure(zod, { operation: "t", log }).kind).toBe("VALIDATION");
  });

  it("honours a DomainError's own kind, message and field errors", () => {
    const err = new DomainError("FORBIDDEN", "Only a checker may approve this.", { approve: ["not permitted"] });
    const failure = toMutationFailure(err, { operation: "t", log });
    expect(failure.kind).toBe("FORBIDDEN");
    expect(failure.message).toBe("Only a checker may approve this.");
    expect(failure.fieldErrors).toEqual({ approve: ["not permitted"] });
  });

  it("is PESSIMISTIC about an unrecognised error — UNKNOWN_OUTCOME, not failed", () => {
    // The whole point: we cannot prove nothing was written, so we must not
    // present it as a clean failure the user should resubmit.
    const failure = toMutationFailure(new Error("kaboom"), { operation: "t", log });
    expect(failure.kind).toBe("UNKNOWN_OUTCOME");
    expect(failure.retryable).toBe(false);
  });

  it("never leaks the raw exception text or a Prisma code to the client", () => {
    const err = Object.assign(new Error("Unique constraint failed on Member.nationalId = CM12345678"), {
      code: "P2002",
      meta: { target: ["nationalId"] },
    });
    const failure = toMutationFailure(err, { operation: "t", log });
    const serialized = JSON.stringify(failure);
    expect(serialized).not.toContain("CM12345678");
    expect(serialized).not.toContain("Unique constraint");
    expect(serialized).not.toContain("P2002");
    expect(serialized).not.toContain("nationalId");
  });

  it("logs the original error server-side against the correlation id", () => {
    const entries: Record<string, unknown>[] = [];
    const failure = toMutationFailure(prismaErr("P2002"), {
      operation: "members.create",
      operationId: "op_9",
      log: (e) => entries.push(e),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      operation: "members.create",
      kind: "CONFLICT",
      correlationId: failure.correlationId,
      operationId: "op_9",
      prismaCode: "P2002",
    });
    // The detail the user must not see is exactly what support needs.
    expect(JSON.stringify(entries[0])).toContain("raw prisma text");
  });

  it("carries a caller-supplied correlation id through, so one attempt has one id", () => {
    const correlationId = newCorrelationId();
    const failure = toMutationFailure(new Error("x"), { operation: "t", correlationId, log: vi.fn() });
    expect(failure.correlationId).toBe(correlationId);
  });
});
