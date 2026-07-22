/**
 * Claims Autopilot F3.2 — reason catalog completeness, privacy, and consistency
 * with the golden oracle.
 */
import { describe, it, expect } from "vitest";
import {
  ROUTE_CODES,
  QUEUES,
  REASON_CATALOG,
  getReason,
  queueFor,
  reasonForAudience,
  PASS,
  route,
  type RouteCode,
} from "@/server/services/claim-intake/reason-catalog";
import { GOLDEN_SCENARIOS } from "../fixtures/claims-autopilot";

const ALL_CODES = Object.values(ROUTE_CODES) as RouteCode[];
const QUEUE_VALUES = new Set<string>(Object.values(QUEUES));

describe("F3.2 — catalog is complete", () => {
  it("every route code has a full, well-formed entry", () => {
    for (const code of ALL_CODES) {
      const e = REASON_CATALOG[code];
      expect(e, code).toBeDefined();
      expect(e.queue === null || QUEUE_VALUES.has(e.queue), `${code} queue`).toBe(true);
      expect(e.internal.length, `${code} internal`).toBeGreaterThan(0);
      expect(e.provider.length, `${code} provider`).toBeGreaterThan(0);
      expect(e.remedy.length, `${code} remedy`).toBeGreaterThan(0);
      expect(typeof e.resubmissionAllowed).toBe("boolean");
      expect(typeof e.overrideAllowed).toBe("boolean");
      if (!e.overrideAllowed) expect(e.overrideType).toBe("NONE");
    }
  });

  it("covers the 23 §10.3 codes", () => {
    expect(ALL_CODES).toHaveLength(23);
  });
});

describe("F3.2 — audience privacy (§11.5)", () => {
  it("no provider/member text leaks internal fraud/investigation wording", () => {
    for (const code of ALL_CODES) {
      const e = REASON_CATALOG[code];
      expect(e.provider, `${code} provider`).not.toMatch(/fraud|investigat|alert/i);
      if (e.member) expect(e.member, `${code} member`).not.toMatch(/fraud|investigat|alert/i);
    }
  });

  it("fraud is named ONLY in the internal message", () => {
    const e = REASON_CATALOG.FRAUD_REVIEW;
    expect(e.internal).toMatch(/fraud/i);
    expect(e.provider).not.toMatch(/fraud/i);
    expect(e.member).not.toMatch(/fraud/i);
    expect(e.queue).toBe(QUEUES.FRAUD_REVIEW);
  });
});

describe("F3.2 — consistent with the golden oracle", () => {
  it("every golden route code maps to the fixture's expected queue", () => {
    for (const sc of GOLDEN_SCENARIOS) {
      const code = sc.oracle.routeCode;
      if (!code) continue;
      expect(ALL_CODES, `${sc.name} routeCode ${code} in catalog`).toContain(code);
      expect(queueFor(code as RouteCode), `${sc.name} queue`).toBe(sc.oracle.assignedQueue);
    }
  });
});

describe("F3.2 — §10.2 live-gate route codes all exist", () => {
  it.each([
    "AUTO_POLICY_NOT_LIVE", "ABOVE_AUTO_CEILING", "ELIGIBILITY_REVIEW", "PROVIDER_ENTITLEMENT_REVIEW",
    "BENEFIT_NOT_CONFIGURED", "PREAUTH_REQUIRED", "PREAUTH_COVER_INSUFFICIENT", "DOCUMENTS_INCOMPLETE",
    "DUPLICATE_REVIEW", "FRAUD_REVIEW", "NO_CONTRACT", "SERVICE_NOT_MAPPED", "RATE_MISSING",
    "PRICING_INCOMPLETE", "BENEFIT_LIMIT_REVIEW", "FX_RATE_MISSING",
  ])("gate code %s is catalogued with a queue", (code) => {
    expect(getReason(code as RouteCode).queue).toBeTruthy();
  });
});

describe("F3.2 — helpers and stage findings", () => {
  it("reasonForAudience returns the right slice", () => {
    expect(reasonForAudience("PREAUTH_REQUIRED", "internal")).toMatch(/pre-authorization/i);
    expect(reasonForAudience("PREAUTH_REQUIRED", "provider")).toMatch(/pre-authorization/i);
    expect(reasonForAudience("PREAUTH_REQUIRED", "member")).toBeTruthy();
  });

  it("shadow-only and transient codes have no human queue", () => {
    expect(queueFor("INPATIENT_SHADOW_ONLY")).toBeNull();
    expect(queueFor("PIPELINE_RETRY")).toBeNull();
    expect(REASON_CATALOG.PIPELINE_RETRY.transient).toBe(true);
  });

  it("StageDisposition helpers", () => {
    expect(PASS).toEqual({ kind: "PASS" });
    expect(route("FRAUD_REVIEW", "rule X")).toEqual({ kind: "ROUTE", code: "FRAUD_REVIEW", detail: "rule X" });
  });
});
