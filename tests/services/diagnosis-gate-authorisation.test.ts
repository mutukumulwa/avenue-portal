/**
 * Diagnosis Gate C3.5 — capability resolution guard.
 *
 * This exists because the feature shipped inoperable to production once already: the UI
 * gated on granular capabilities, and production has zero `Role`/`Permission`/
 * `UserRoleAssignment` rows, so every check returned false for everyone — including
 * SUPER_ADMIN, since `hasPermission` has no bypass. The page rendered and every button
 * refused.
 *
 * The tests below pin the three-step rule and, critically, that the role fallback and
 * the RBAC seed grant the SAME capabilities — two models that disagree would authorise
 * differently per environment, which is how this class of bug returns.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const hasPermission = vi.fn();
const countAssignments = vi.fn();

vi.mock("@/server/services/rbac.service", () => ({
  rbacService: { hasPermission: (...a: unknown[]) => hasPermission(...a) },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { userRoleAssignment: { count: (...a: unknown[]) => countAssignments(...a) } },
}));

const {
  hasClinicalCapability,
  CLINICAL_ROLE_FALLBACK,
  CLINICAL_PROTOCOL_VIEW,
  CLINICAL_PROTOCOL_MANAGE,
  CLINICAL_PROTOCOL_APPROVE,
  CLINICAL_GATE_REVIEW,
} = await import("@/server/services/diagnosis-gate/authorisation");

const T = "tenant-1";

beforeEach(() => {
  hasPermission.mockReset();
  countAssignments.mockReset();
  hasPermission.mockResolvedValue(false);
  countAssignments.mockResolvedValue(0);
});

describe("DG C3.5 — granular RBAC wins when it grants", () => {
  it("allows when the capability is held granularly, whatever the role", async () => {
    hasPermission.mockResolvedValue(true);
    expect(await hasClinicalCapability("u1", "CUSTOMER_SERVICE", CLINICAL_PROTOCOL_MANAGE, T)).toBe(true);
  });
});

describe("DG C3.5 — a granular DENY is authoritative and must not be overridden", () => {
  it("denies a medical officer when granular RBAC is configured for them but withholds it", async () => {
    hasPermission.mockResolvedValue(false);
    countAssignments.mockResolvedValue(2); // the granular model IS in use for this user
    expect(await hasClinicalCapability("u1", "MEDICAL_OFFICER", CLINICAL_PROTOCOL_MANAGE, T)).toBe(false);
  });

  it("denies even SUPER_ADMIN when granular RBAC is in use and does not grant it", async () => {
    countAssignments.mockResolvedValue(1);
    expect(await hasClinicalCapability("u1", "SUPER_ADMIN", CLINICAL_PROTOCOL_APPROVE, T)).toBe(false);
  });
});

describe("DG C3.5 — role fallback when granular RBAC is not configured (production)", () => {
  // With zero assignments the granular model has no opinion, so the platform's role
  // model decides — the same model the other 214 admin surfaces use.
  it.each([
    ["MEDICAL_OFFICER", CLINICAL_PROTOCOL_MANAGE, true],
    ["MEDICAL_OFFICER", CLINICAL_PROTOCOL_APPROVE, true],
    ["MEDICAL_OFFICER", CLINICAL_PROTOCOL_VIEW, true],
    ["MEDICAL_OFFICER", CLINICAL_GATE_REVIEW, true],
    ["SUPER_ADMIN", CLINICAL_PROTOCOL_MANAGE, true],
    ["SUPER_ADMIN", CLINICAL_PROTOCOL_APPROVE, true],
    // A claims officer works the queue but must not author or approve medicine.
    ["CLAIMS_OFFICER", CLINICAL_GATE_REVIEW, true],
    ["CLAIMS_OFFICER", CLINICAL_PROTOCOL_VIEW, true],
    ["CLAIMS_OFFICER", CLINICAL_PROTOCOL_MANAGE, false],
    ["CLAIMS_OFFICER", CLINICAL_PROTOCOL_APPROVE, false],
    // Roles with no clinical standing get nothing.
    ["FINANCE_OFFICER", CLINICAL_PROTOCOL_VIEW, false],
    ["CUSTOMER_SERVICE", CLINICAL_GATE_REVIEW, false],
    ["UNDERWRITER", CLINICAL_PROTOCOL_MANAGE, false],
    ["PROVIDER_USER", CLINICAL_PROTOCOL_VIEW, false],
    ["MEMBER_USER", CLINICAL_PROTOCOL_VIEW, false],
  ])("role %s + %s → %s", async (role, cap, expected) => {
    expect(await hasClinicalCapability("u1", role, cap, T)).toBe(expected);
  });

  it("denies when the session carries no role at all", async () => {
    expect(await hasClinicalCapability("u1", null, CLINICAL_PROTOCOL_VIEW, T)).toBe(false);
    expect(await hasClinicalCapability("u1", undefined, CLINICAL_PROTOCOL_VIEW, T)).toBe(false);
  });

  it("denies an unknown capability rather than defaulting open", async () => {
    expect(await hasClinicalCapability("u1", "SUPER_ADMIN", "CLINICAL_PROTOCOL:DELETE_EVERYTHING", T)).toBe(false);
  });
});

describe("DG C3.5 — resilient to RBAC infrastructure failure", () => {
  it("a throwing hasPermission does not crash the page, and still resolves by role", async () => {
    hasPermission.mockRejectedValue(new Error("db down"));
    expect(await hasClinicalCapability("u1", "MEDICAL_OFFICER", CLINICAL_PROTOCOL_MANAGE, T)).toBe(true);
  });

  it("a throwing assignment count fails CLOSED for a role with no fallback grant", async () => {
    countAssignments.mockRejectedValue(new Error("db down"));
    expect(await hasClinicalCapability("u1", "FINANCE_OFFICER", CLINICAL_PROTOCOL_MANAGE, T)).toBe(false);
  });
});

describe("DG C3.5 — the two authorisation models must not diverge", () => {
  // If the seed and the fallback disagree, the same person is authorised differently in
  // a seeded environment than in production — exactly the drift that caused this bug.
  const rbac = readFileSync(resolve(process.cwd(), "prisma/seeds/rbac.ts"), "utf8");

  const seededBlock = (roleCode: string, nextRoleCode: string) =>
    rbac.slice(rbac.indexOf(`${roleCode}: [`), rbac.indexOf(`${nextRoleCode}: [`));

  it("MEDICAL_OFFICER's seeded grants match the fallback exactly", () => {
    const block = seededBlock("MEDICAL_OFFICER", "MEDICAL_ADVISOR");
    for (const [cap, roles] of Object.entries(CLINICAL_ROLE_FALLBACK)) {
      expect(block.includes(cap), `${cap} seeded for MEDICAL_OFFICER`).toBe(roles.includes("MEDICAL_OFFICER"));
    }
  });

  it("CLAIMS_OFFICER's seeded grants match the fallback exactly", () => {
    const block = seededBlock("CLAIMS_OFFICER", "SENIOR_CLAIMS_OFFICER");
    for (const [cap, roles] of Object.entries(CLINICAL_ROLE_FALLBACK)) {
      expect(block.includes(cap), `${cap} seeded for CLAIMS_OFFICER`).toBe(roles.includes("CLAIMS_OFFICER"));
    }
  });

  it("every fallback capability is a real catalogued permission", () => {
    for (const cap of Object.keys(CLINICAL_ROLE_FALLBACK)) {
      expect(rbac, cap).toContain(`code: "${cap}"`);
    }
  });

  it("SUPER_ADMIN holds every clinical capability in both models", () => {
    // The seed gives SUPER_ADMIN ALL_PERMISSION_CODES, so the fallback must too.
    for (const [cap, roles] of Object.entries(CLINICAL_ROLE_FALLBACK)) {
      expect(roles, cap).toContain("SUPER_ADMIN");
    }
  });
});
