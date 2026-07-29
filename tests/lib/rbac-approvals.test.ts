import { describe, it, expect, vi } from "vitest";

// rbac.ts co-locates the ROLES constant with requireRole(), which imports the
// auth/session layer. Stub those so we can assert the pure ROLES data without a
// server context.
vi.mock("@/lib/auth", () => ({ getCachedSession: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { ROLES } from "@/lib/rbac";

/**
 * F76-GAP-02 — a FINANCE_OFFICER is the money-control checker for governed
 * changes (AUTO_ADJ_POLICY_CHANGE) and must be able to reach /approvals. The
 * widening is deliberately scoped to a dedicated APPROVALS set, NOT OPS, so a
 * finance officer gains the approvals queue only — not the ~180 member / claim /
 * case pages gated on OPS.
 */
describe("ROLES.APPROVALS (F76-GAP-02)", () => {
  it("lets a FINANCE_OFFICER reach the approvals queue", () => {
    expect(ROLES.APPROVALS).toContain("FINANCE_OFFICER");
  });

  it("is a superset of OPS — every existing approver keeps access", () => {
    for (const role of ROLES.OPS) expect(ROLES.APPROVALS).toContain(role);
  });

  it("does NOT widen OPS itself — finance officers do not gain the member/claim OPS pages", () => {
    expect(ROLES.OPS).not.toContain("FINANCE_OFFICER");
  });
});
