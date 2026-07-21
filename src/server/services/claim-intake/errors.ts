/**
 * Claims Autopilot — structured intake errors and transport mapping (F1.4).
 *
 * Services throw/return a typed `IntakeError`; route handlers and server actions
 * map it to a stable transport shape. Callers NEVER see raw Zod/Prisma/SQL/stack
 * or internal schema text (§7.3, §11.5). A separate log-safe `logContext` carries
 * internal diagnostics for operators without exposing them publicly.
 *
 * This module contains NO claim business rules — it only classifies and maps.
 */
import { ZodError, type ZodIssue } from "zod";

/** Stable field-level issue (§7.3). `message` is safe to show a caller. */
export interface IntakeIssue {
  path: string;
  code: string;
  message: string;
  severity: "ERROR" | "WARNING";
}

/** Error kinds and their transport statuses. */
export type IntakeErrorKind =
  | "VALIDATION" // 422 — structural validation failed
  | "AUTHENTICATION" // 401 — no/invalid credential
  | "AUTHORIZATION" // 403 — authenticated but out of scope
  | "IDEMPOTENCY_CONFLICT" // 409 — same key, different request hash
  | "RETRYABLE" // 503 — transient failure BEFORE authoritative acceptance
  | "INTERNAL"; // 500 — exhausted/unexpected technical failure

const STATUS: Record<IntakeErrorKind, number> = {
  VALIDATION: 422,
  AUTHENTICATION: 401,
  AUTHORIZATION: 403,
  IDEMPOTENCY_CONFLICT: 409,
  RETRYABLE: 503,
  INTERNAL: 500,
};

/** Stable string codes reused across errors, responses, logs and tests. */
export const INTAKE_CODES = {
  // error codes
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN_SCOPE: "FORBIDDEN_SCOPE",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  RETRYABLE_UNAVAILABLE: "RETRYABLE_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  // non-error outcome codes (carried by the submit RESULT, not thrown — F3.4)
  ACCEPTED: "ACCEPTED",
  REPLAYED: "REPLAYED",
  ROUTED: "ROUTED",
} as const;

const GENERIC_INTERNAL_MESSAGE = "An unexpected error occurred while processing the claim. Please retry shortly.";

function sanitizeMessage(msg: string): string {
  // Strip newlines/control chars and cap length so no stack/multiline internal
  // text can ride along in a public message.
  return msg.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 200);
}

function zodCodeToStable(code: ZodIssue["code"]): string {
  switch (code) {
    case "invalid_type":
      return "INVALID_TYPE";
    case "too_small":
      return "TOO_SMALL";
    case "too_big":
      return "TOO_BIG";
    case "invalid_string":
      return "INVALID_FORMAT";
    case "invalid_enum_value":
      return "INVALID_VALUE";
    case "unrecognized_keys":
      return "UNKNOWN_FIELD";
    case "invalid_literal":
      return "UNSUPPORTED_VERSION";
    default:
      return "INVALID";
  }
}

/** Map a ZodError to safe issues — no raw Zod object, stack, or schema dump. */
export function zodToIntakeIssues(err: ZodError): IntakeIssue[] {
  return err.issues.map((i) => ({
    path: i.path.length > 0 ? i.path.join(".") : "(root)",
    code: zodCodeToStable(i.code),
    message: sanitizeMessage(i.message),
    severity: "ERROR" as const,
  }));
}

/**
 * The one typed intake error. `message` (a.k.a. Error.message) is always safe to
 * surface; `logContext` is internal-only and must never be placed in a response.
 */
export class IntakeError extends Error {
  readonly kind: IntakeErrorKind;
  readonly code: string;
  readonly httpStatus: number;
  readonly issues?: IntakeIssue[];
  /** Internal-only diagnostic context (safe to log, never to return). */
  readonly logContext?: Record<string, unknown>;
  /** For conflicts: a reference to the original receipt so the caller can open it. */
  readonly originalReceiptRef?: string;

  constructor(args: {
    kind: IntakeErrorKind;
    code: string;
    message: string;
    issues?: IntakeIssue[];
    logContext?: Record<string, unknown>;
    originalReceiptRef?: string;
  }) {
    super(sanitizeMessage(args.message));
    this.name = "IntakeError";
    this.kind = args.kind;
    this.code = args.code;
    this.httpStatus = STATUS[args.kind];
    this.issues = args.issues;
    this.logContext = args.logContext;
    this.originalReceiptRef = args.originalReceiptRef;
  }

  static validation(issues: IntakeIssue[], message = "The submission failed validation."): IntakeError {
    return new IntakeError({ kind: "VALIDATION", code: INTAKE_CODES.VALIDATION_FAILED, message, issues });
  }

  static fromZod(err: ZodError): IntakeError {
    return IntakeError.validation(zodToIntakeIssues(err));
  }

  static authentication(message = "Authentication is required."): IntakeError {
    return new IntakeError({ kind: "AUTHENTICATION", code: INTAKE_CODES.UNAUTHENTICATED, message });
  }

  /** Out-of-scope. Message is deliberately non-enumerating (§11.5). */
  static authorization(message = "You are not permitted to submit this claim.", logContext?: Record<string, unknown>): IntakeError {
    return new IntakeError({ kind: "AUTHORIZATION", code: INTAKE_CODES.FORBIDDEN_SCOPE, message, logContext });
  }

  static idempotencyConflict(originalReceiptRef?: string): IntakeError {
    return new IntakeError({
      kind: "IDEMPOTENCY_CONFLICT",
      code: INTAKE_CODES.IDEMPOTENCY_KEY_REUSED,
      message: "This idempotency key was already used for a different claim. Open the original submission or start a correction.",
      originalReceiptRef,
    });
  }

  static retryable(message = "The service is temporarily unavailable. Retry with the same idempotency key.", logContext?: Record<string, unknown>): IntakeError {
    return new IntakeError({ kind: "RETRYABLE", code: INTAKE_CODES.RETRYABLE_UNAVAILABLE, message, logContext });
  }

  static internal(logContext?: Record<string, unknown>): IntakeError {
    return new IntakeError({ kind: "INTERNAL", code: INTAKE_CODES.INTERNAL_ERROR, message: GENERIC_INTERNAL_MESSAGE, logContext });
  }

  /**
   * Wrap an arbitrary thrown value into a safe IntakeError. An unknown error
   * (Prisma/SQL/TypeError/…) becomes a generic INTERNAL error whose ORIGINAL
   * text is captured only in `logContext` and never surfaced publicly.
   */
  static from(err: unknown): IntakeError {
    if (err instanceof IntakeError) return err;
    if (err instanceof ZodError) return IntakeError.fromZod(err);
    const original = err instanceof Error ? err.message : String(err);
    return IntakeError.internal({ original: original.slice(0, 500) });
  }
}

/** Public transport body — never contains internal diagnostics. */
export interface IntakeErrorBody {
  success: false;
  code: string;
  message: string;
  issues?: IntakeIssue[];
  originalReceiptRef?: string;
}

/** HTTP mapping for route handlers. Returns status + a PHI/internal-safe body. */
export function toHttpResponse(err: unknown): { status: number; body: IntakeErrorBody } {
  const e = IntakeError.from(err);
  const body: IntakeErrorBody = { success: false, code: e.code, message: e.message };
  if (e.issues) body.issues = e.issues;
  if (e.originalReceiptRef) body.originalReceiptRef = e.originalReceiptRef;
  return { status: e.httpStatus, body };
}

/** Server-action result mapping. Retains a helpful message the UI can render. */
export interface IntakeActionErrorResult {
  ok: false;
  code: string;
  error: string;
  issues?: IntakeIssue[];
}

export function toActionResult(err: unknown): IntakeActionErrorResult {
  const e = IntakeError.from(err);
  const result: IntakeActionErrorResult = { ok: false, code: e.code, error: e.message };
  if (e.issues) result.issues = e.issues;
  return result;
}
