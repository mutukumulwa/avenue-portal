/**
 * Claims Autopilot F1.4 — structured intake errors + transport mapping.
 * Proves: stable status codes, no internal leakage, helpful action messages.
 */
import { describe, it, expect } from "vitest";
import {
  IntakeError,
  toHttpResponse,
  toActionResult,
  zodToIntakeIssues,
  INTAKE_CODES,
} from "@/server/services/claim-intake/errors";
import { ClaimSubmissionV1Schema } from "@/server/services/claim-intake/schema";

/** Serialize a public body/result to catch any accidental leakage. */
function asText(v: unknown): string {
  return JSON.stringify(v);
}
const LEAK_MARKERS = [/ZodError/i, /PrismaClient/i, /\bat .*\.ts:\d+/i, /SELECT .* FROM/i, /node_modules/i, /\bstack\b/i];

describe("F1.4 — stable HTTP status mapping", () => {
  it.each([
    ["validation", IntakeError.validation([{ path: "lines", code: "TOO_SMALL", message: "at least one line", severity: "ERROR" }]), 422, INTAKE_CODES.VALIDATION_FAILED],
    ["authentication", IntakeError.authentication(), 401, INTAKE_CODES.UNAUTHENTICATED],
    ["authorization", IntakeError.authorization(), 403, INTAKE_CODES.FORBIDDEN_SCOPE],
    ["idempotency conflict", IntakeError.idempotencyConflict("rcpt-1"), 409, INTAKE_CODES.IDEMPOTENCY_KEY_REUSED],
    ["retryable", IntakeError.retryable(), 503, INTAKE_CODES.RETRYABLE_UNAVAILABLE],
    ["internal", IntakeError.internal(), 500, INTAKE_CODES.INTERNAL_ERROR],
  ])("%s → correct status + code", (_n, err, status, code) => {
    const r = toHttpResponse(err);
    expect(r.status).toBe(status);
    expect(r.body.code).toBe(code);
    expect(r.body.success).toBe(false);
    expect(typeof r.body.message).toBe("string");
    expect(r.body.message.length).toBeGreaterThan(0);
  });

  it("conflict body carries the original receipt reference", () => {
    const r = toHttpResponse(IntakeError.idempotencyConflict("rcpt-original-1"));
    expect(r.body.originalReceiptRef).toBe("rcpt-original-1");
  });
});

describe("F1.4 — no raw Zod / Prisma / SQL / stack leakage", () => {
  it("maps a real ZodError to safe issues (no ZodError internals)", () => {
    const bad = { schemaVersion: "1", idempotencyKey: "short", member: {}, provider: {}, encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "nope" }, diagnoses: [], lines: [] };
    const parsed = ClaimSubmissionV1Schema.safeParse(bad);
    expect(parsed.success).toBe(false);
    const issues = zodToIntakeIssues((parsed as { error: import("zod").ZodError }).error);
    expect(issues.length).toBeGreaterThan(0);
    for (const iss of issues) {
      expect(iss.severity).toBe("ERROR");
      expect(typeof iss.path).toBe("string");
      expect(iss.message).not.toMatch(/\n/); // sanitized single-line
    }
    const text = asText(toHttpResponse(IntakeError.fromZod((parsed as { error: import("zod").ZodError }).error)).body);
    for (const m of LEAK_MARKERS) expect(text).not.toMatch(m);
  });

  it("wraps an arbitrary Prisma-like error as generic 500, hiding the original", () => {
    const prismaLike = new Error("PrismaClientKnownRequestError: Unique constraint failed on the fields: (`claimNumber`) SELECT * FROM \"Claim\"");
    prismaLike.stack = "Error: ...\n    at Object.<anonymous> (/app/node_modules/@prisma/client/index.ts:123:45)";
    const r = toHttpResponse(prismaLike);
    expect(r.status).toBe(500);
    expect(r.body.code).toBe(INTAKE_CODES.INTERNAL_ERROR);
    const text = asText(r.body);
    for (const m of LEAK_MARKERS) expect(text).not.toMatch(m);
    expect(text).not.toMatch(/constraint/i);
    expect(text).not.toMatch(/claimNumber/);
    // ...but the original IS captured internally for operators.
    const wrapped = IntakeError.from(prismaLike);
    expect(wrapped.logContext?.original).toMatch(/PrismaClientKnownRequestError/);
  });

  it("an authorization error does not enumerate what exists", () => {
    const r = toHttpResponse(IntakeError.authorization("You are not permitted to submit this claim.", { attemptedMemberId: "m-secret" }));
    expect(asText(r.body)).not.toMatch(/m-secret/);
  });
});

describe("F1.4 — server-action result mapping", () => {
  it("returns ok:false with a helpful message and code (Next masks thrown messages)", () => {
    const r = toActionResult(IntakeError.validation([{ path: "member", code: "INVALID", message: "member id or member number is required", severity: "ERROR" }]));
    expect(r.ok).toBe(false);
    expect(r.code).toBe(INTAKE_CODES.VALIDATION_FAILED);
    expect(r.error.length).toBeGreaterThan(0);
    expect(r.issues?.[0].message).toMatch(/member/);
  });

  it("wraps an unknown error into a safe action result", () => {
    const r = toActionResult(new Error("connect ECONNREFUSED 127.0.0.1:5432"));
    expect(r.ok).toBe(false);
    expect(r.code).toBe(INTAKE_CODES.INTERNAL_ERROR);
    expect(r.error).not.toMatch(/ECONNREFUSED/);
    expect(r.error).not.toMatch(/5432/);
  });

  it("IntakeError.from is idempotent for an existing IntakeError", () => {
    const e = IntakeError.authentication();
    expect(IntakeError.from(e)).toBe(e);
  });
});
