/**
 * UAT-HF P01.01 — the mutation envelope.
 *
 * `ActionResult` (SP-2) already killed "throw for validation" and "redirect on
 * error". It cannot answer the questions the human-factors run actually asked:
 *
 *   DEF-065  a network drop during submit crashed the client, destroyed every
 *            typed value, and hid a write that HAD committed (the server returned
 *            200 and created UX26-2026-00037 while the operator saw only a crash)
 *   DEF-070  one generic failure screen served every cause, with no reference
 *   DEF-034  a double-click silently discarded an enrolment
 *   DEF-068  a dropped import confirm left no way to learn the outcome
 *   DEF-071  form state was lost on failure
 *   DEF-075  success gave no reference and no next action
 *
 * So a result must distinguish **five** failure kinds — most importantly
 * "definitely did not happen" from "cannot tell" — and success must carry a
 * quotable reference.
 *
 * ── Backwards compatibility ────────────────────────────────────────────────
 * `MutationResult<T>` is assignable to `ActionResult<T>`: success keeps `data`,
 * and failure mirrors `message` into `formError` and keeps `fieldErrors`. The 20
 * existing `ActionResult` consumers keep working untouched; P04.01 migrates the
 * critical forms to read the richer fields.
 */
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { newCorrelationId } from "@/lib/correlation";

/**
 * Why a mutation failed, in the only terms a caller can act on.
 *
 * VALIDATION      the input was rejected. Nothing was written. Fix the input.
 * CONFLICT        the world was not as assumed — a unique collided, the object
 *                 version was stale, or the same idempotency key arrived with a
 *                 different payload. Nothing was written. Re-read, then decide.
 * FORBIDDEN       the actor may not do this. Nothing was written.
 * UNAVAILABLE     a dependency was down and the write was rolled back. Nothing
 *                 was written *as far as the server can tell*. Safe to retry.
 * UNKNOWN_OUTCOME the server cannot say whether the write committed. This is the
 *                 one that matters: it must NEVER be retried blindly. Query the
 *                 operation receipt first (P01.02).
 */
export type MutationFailureKind =
  | "VALIDATION"
  | "CONFLICT"
  | "FORBIDDEN"
  | "UNAVAILABLE"
  | "UNKNOWN_OUTCOME";

export type MutationSuccess<T = void> = {
  ok: true;
  data?: T;
  /** Stable id of the intended business effect; the receipt lookup key. */
  operationId: string;
  /** Quotable business reference for the affected object, e.g. "UX26-2026-00017". */
  entityRef?: string;
  /** True when this call matched an existing receipt and performed no new write. */
  replayed: boolean;
  /** What the user can sensibly do next, e.g. "View member". */
  nextAction?: string;
};

export type MutationFailure = {
  ok: false;
  kind: MutationFailureKind;
  /** User-safe. Never a raw exception message, never PII. */
  message: string;
  fieldErrors?: Record<string, string[]>;
  operationId?: string;
  /** Always present, always quotable — this is what support searches on. */
  correlationId: string;
  /**
   * Whether an automatic retry is safe. False for UNKNOWN_OUTCOME **by
   * construction**: the whole point is that a retry could double-write.
   */
  retryable: boolean;
  /** Mirrors `message` so existing ActionResult consumers keep rendering. */
  formError: string;
};

export type MutationResult<T = void> = MutationSuccess<T> | MutationFailure;

/**
 * Hidden form field carrying the draft's operation id from client to server.
 * The client mints it once per draft (P01.01) and the server uses it as the
 * receipt's idempotency key (P01.02), which is what makes a double-submit a
 * replay instead of a second write (DEF-034).
 */
export const OPERATION_ID_FIELD = "__operationId";

/** Default user-safe copy per kind. Callers should override with task-specific text. */
const DEFAULT_MESSAGE: Record<MutationFailureKind, string> = {
  VALIDATION: "Some details need correcting. Check the highlighted fields and try again.",
  CONFLICT: "This record changed since you opened it. Reload to see the current values, then reapply your change.",
  FORBIDDEN: "You do not have permission to do this.",
  UNAVAILABLE: "The service is temporarily unavailable and your change was not saved. Try again shortly.",
  UNKNOWN_OUTCOME:
    "We could not confirm whether this was saved. Do not resubmit — open the record or use the reference below to check first.",
};

/**
 * True when `message` is just the built-in copy for this kind, i.e. the caller
 * supplied nothing specific. UI can then render its own richer body instead of
 * echoing a sentence that repeats the banner heading.
 */
export function isDefaultMessage(kind: MutationFailureKind, message: string): boolean {
  return DEFAULT_MESSAGE[kind] === message;
}

/** Whether an automatic retry is safe for this kind. */
const RETRYABLE: Record<MutationFailureKind, boolean> = {
  VALIDATION: false,
  CONFLICT: false,
  FORBIDDEN: false,
  UNAVAILABLE: true,
  UNKNOWN_OUTCOME: false, // never — see MutationFailure.retryable
};

export function mutationOk<T = void>(
  operationId: string,
  options: { data?: T; entityRef?: string; replayed?: boolean; nextAction?: string } = {},
): MutationSuccess<T> {
  return {
    ok: true,
    operationId,
    replayed: options.replayed ?? false,
    ...(options.data === undefined ? {} : { data: options.data }),
    ...(options.entityRef ? { entityRef: options.entityRef } : {}),
    ...(options.nextAction ? { nextAction: options.nextAction } : {}),
  };
}

export function mutationFail(
  kind: MutationFailureKind,
  options: {
    message?: string;
    fieldErrors?: Record<string, string[]>;
    operationId?: string;
    correlationId?: string;
    /** Only honoured for kinds where a retry can ever be safe. */
    retryable?: boolean;
  } = {},
): MutationFailure {
  const message = options.message?.trim() || DEFAULT_MESSAGE[kind];
  const hasFields = !!options.fieldErrors && Object.keys(options.fieldErrors).length > 0;
  // UNKNOWN_OUTCOME can never be marked retryable, whatever the caller passes.
  const retryable = kind === "UNKNOWN_OUTCOME" ? false : (options.retryable ?? RETRYABLE[kind]);
  return {
    ok: false,
    kind,
    message,
    formError: message,
    correlationId: options.correlationId ?? newCorrelationId(),
    retryable,
    ...(hasFields ? { fieldErrors: options.fieldErrors } : {}),
    ...(options.operationId ? { operationId: options.operationId } : {}),
  };
}

export function isMutationFailure(value: unknown): value is MutationFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as MutationFailure).ok === false &&
    typeof (value as MutationFailure).kind === "string" &&
    typeof (value as MutationFailure).correlationId === "string"
  );
}

/** Narrow an `ActionResult` that may or may not be an envelope. */
export function isMutationResult<T>(value: ActionResult<T> | MutationResult<T>): value is MutationResult<T> {
  if (value.ok === true) return typeof (value as MutationSuccess<T>).operationId === "string";
  return isMutationFailure(value);
}

// ── error mapping ────────────────────────────────────────────────────────────

/**
 * `redirect()` and `notFound()` signal by throwing. They must propagate, never be
 * mapped to a failure — swallowing them turns a successful redirect into a fake
 * error. This is a long-standing landmine in this repo.
 */
export function isControlFlowError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")) {
    return true;
  }
  return err instanceof Error && (err.message === "NEXT_REDIRECT" || err.message === "NEXT_NOT_FOUND");
}

function prismaCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

function isZodError(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  return name === "ZodError" && Array.isArray((err as { issues?: unknown }).issues);
}

/**
 * A domain error that already knows its own safe kind and message. Services throw
 * this when they want a specific outcome to reach the user; anything else is
 * treated as unexpected and deliberately given the pessimistic mapping.
 */
export class DomainError extends Error {
  constructor(
    readonly kind: MutationFailureKind,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/**
 * The single mapper from any thrown value to a safe failure.
 *
 * Two rules it exists to enforce:
 *
 *  1. **No raw exception text or PII ever reaches the client.** The original error
 *     is logged server-side against the correlation id; the caller gets prepared
 *     copy. A Prisma unique violation must not tell the user *whose* record
 *     collided (DEF-027, DEF-078) — that is an authorised review workflow, not an
 *     error message.
 *  2. **An unrecognised error is UNKNOWN_OUTCOME, not "failed".** We cannot prove
 *     it rolled back, so we must not invite a retry that could double-write. The
 *     recognised Prisma/Zod cases below are all provably pre-commit, so they get
 *     their honest kind.
 */
export function toMutationFailure(
  err: unknown,
  context: {
    operation: string;
    operationId?: string;
    correlationId?: string;
    /** Defaults to console.error; injectable for tests and for a real logger later. */
    log?: (entry: Record<string, unknown>) => void;
  },
): MutationFailure {
  if (isControlFlowError(err)) throw err;

  const correlationId = context.correlationId ?? newCorrelationId();
  const base = { operationId: context.operationId, correlationId };

  let failure: MutationFailure;

  if (err instanceof DomainError) {
    failure = mutationFail(err.kind, { ...base, message: err.message, fieldErrors: err.fieldErrors });
  } else if (isZodError(err)) {
    failure = mutationFail("VALIDATION", base);
  } else {
    switch (prismaCode(err)) {
      case "P2002": // unique constraint — deliberately does NOT name the other record
      case "P2025": // record required but not found: a stale update
      case "P2034": // transaction write conflict / deadlock
        failure = mutationFail("CONFLICT", base);
        break;
      case "P2003": // foreign key constraint failed
      case "P2000": // value too long for column
      case "P2006": // invalid value for field
        failure = mutationFail("VALIDATION", base);
        break;
      case "P1001": // cannot reach database
      case "P1002": // database timed out
      case "P1008": // operation timed out
      case "P1017": // server closed the connection
        failure = mutationFail("UNAVAILABLE", base);
        break;
      default:
        // Unrecognised. We cannot prove nothing was written — be pessimistic.
        failure = mutationFail("UNKNOWN_OUTCOME", base);
    }
  }

  const log = context.log ?? ((entry) => console.error("[mutation]", entry));
  log({
    operation: context.operation,
    kind: failure.kind,
    correlationId,
    operationId: context.operationId,
    prismaCode: prismaCode(err),
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
  });

  return failure;
}

/** Adapt an older `ActionFailure` into the envelope, for incremental migration. */
export function fromActionFailure(failure: ActionFailure, kind: MutationFailureKind = "VALIDATION"): MutationFailure {
  return mutationFail(kind, { message: failure.formError, fieldErrors: failure.fieldErrors });
}
