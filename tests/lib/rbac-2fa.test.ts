/**
 * WP-8 (CU-OBS-15 / DEC-09) — requireRole confines a privileged session that
 * has not enrolled an authenticator to the Settings → Security surface, and
 * the enrolment surface itself opts out so the grace flow cannot deadlock.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const authMock = vi.hoisted(() => ({ getCachedSession: vi.fn() }));
vi.mock("@/lib/auth", () => authMock);

const nav = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("next/navigation", () => nav);

import { requireRole, ROLES } from "@/lib/rbac";

const session = (over: Record<string, unknown> = {}) => ({
  user: { id: "u1", role: "FINANCE_OFFICER", tenantId: "t1", ...over },
});

beforeEach(() => vi.clearAllMocks());

describe("requireRole × 2FA enrolment gate (WP-8)", () => {
  it("confines an unenrolled privileged session to the security page", async () => {
    authMock.getCachedSession.mockResolvedValue(session({ mustEnrollTotp: true }));
    await expect(requireRole(ROLES.ANY_STAFF)).rejects.toThrow(
      "REDIRECT:/settings/security?setup=2fa-required",
    );
  });

  it("the enrolment surface itself stays reachable (allow2faEnrolment)", async () => {
    authMock.getCachedSession.mockResolvedValue(session({ mustEnrollTotp: true }));
    const s = await requireRole(ROLES.ANY_STAFF, { allow2faEnrolment: true });
    expect(s.user.id).toBe("u1");
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("an enrolled (or non-privileged) session passes untouched", async () => {
    authMock.getCachedSession.mockResolvedValue(session({ mustEnrollTotp: false }));
    const s = await requireRole(ROLES.ANY_STAFF);
    expect(s.user.role).toBe("FINANCE_OFFICER");
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("role gating still precedes the 2FA gate (unauthorized wins)", async () => {
    authMock.getCachedSession.mockResolvedValue(session({ role: "MEMBER_USER", mustEnrollTotp: true }));
    await expect(requireRole(ROLES.OPS)).rejects.toThrow("REDIRECT:/unauthorized");
  });
});
