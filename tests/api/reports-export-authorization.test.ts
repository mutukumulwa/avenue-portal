/**
 * PROD-BLOCKER-3 — /api/reports/[reportType]/export authorization.
 *
 * Mock-based (tests/api convention). Before WP-3.5B the handler authorized on
 * `session.user.tenantId` ALONE, so any authenticated user — a member, an HR
 * manager, a provider — could GET the tenant's entire named claim/membership
 * register. This suite pins the fix: only internal/reporting staff
 * (ROLES.ANY_STAFF, the same allow-list the admin report page uses) may export;
 * everyone else is denied 403 BEFORE any data is read, and a group-restricted
 * principal cannot pull a tenant-wide report even past the role gate.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AnalyticsAccessScope } from "@/lib/analytics-access";

const sessionHolder = vi.hoisted(() => ({ session: null as unknown }));
const scopeHolder = vi.hoisted(() => ({ scope: null as unknown as AnalyticsAccessScope }));
const db = vi.hoisted(() => ({ claim: { findMany: vi.fn(async () => [] as unknown[]) } }));

vi.mock("@/lib/auth", () => ({ auth: async () => sessionHolder.session }));
vi.mock("@/lib/analytics-access", () => ({ getAnalyticsAccessScope: async () => scopeHolder.scope }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/report-exclusions", () => ({ getExclusionRejectionRows: async () => [] }));

import { GET } from "@/app/api/reports/[reportType]/export/route";

const call = (reportType = "claims") =>
  GET(new Request("https://x/api/reports/claims/export"), { params: Promise.resolve({ reportType }) });

const unrestrictedScope = (role: string): AnalyticsAccessScope =>
  ({ tenantId: "t1", userId: "u1", role: role as AnalyticsAccessScope["role"] });

beforeEach(() => {
  vi.clearAllMocks();
  sessionHolder.session = null;
  scopeHolder.scope = unrestrictedScope("SUPER_ADMIN");
});

describe("reports export — authorization (PROD-BLOCKER-3)", () => {
  it("401 when unauthenticated", async () => {
    sessionHolder.session = null;
    const res = await call();
    expect(res.status).toBe(401);
    expect(db.claim.findMany).not.toHaveBeenCalled();
  });

  it.each(["MEMBER_USER", "HR_MANAGER", "PROVIDER_USER", "FUND_ADMINISTRATOR", "BROKER_USER"])(
    "403 for %s (no export authority) — and no data is read",
    async (role) => {
      sessionHolder.session = { user: { id: "u1", tenantId: "t1", role } };
      scopeHolder.scope = unrestrictedScope(role);
      const res = await call();
      expect(res.status).toBe(403);
      expect(db.claim.findMany).not.toHaveBeenCalled();
    },
  );

  it("403 when the session carries no role at all", async () => {
    sessionHolder.session = { user: { id: "u1", tenantId: "t1" } };
    const res = await call();
    expect(res.status).toBe(403);
    expect(db.claim.findMany).not.toHaveBeenCalled();
  });

  it.each(["SUPER_ADMIN", "CLAIMS_OFFICER", "FINANCE_OFFICER", "REPORTS_VIEWER"])(
    "200 for internal/reporting role %s",
    async (role) => {
      sessionHolder.session = { user: { id: "u1", tenantId: "t1", role } };
      scopeHolder.scope = unrestrictedScope(role);
      const res = await call();
      expect(res.status).toBe(200);
      expect(db.claim.findMany).toHaveBeenCalledTimes(1);
    },
  );

  it("defence-in-depth: a group-restricted scope is denied a tenant-wide report even past the role gate", async () => {
    sessionHolder.session = { user: { id: "u1", tenantId: "t1", role: "REPORTS_VIEWER" } };
    scopeHolder.scope = { tenantId: "t1", userId: "u1", role: "REPORTS_VIEWER", allowedGroupIds: ["g1"] };
    const res = await call("claims");
    expect(res.status).toBe(403);
    expect(db.claim.findMany).not.toHaveBeenCalled();
  });
});
