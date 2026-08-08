import { describe, it, expect } from "vitest";
import { resolvePostLoginPath } from "@/lib/post-login";

// BD-03: the post-login redirect target must be resolvable WITHOUT importing any
// RSC/next-auth machinery — this test would not compile/run if the resolver
// pulled in React `cache()` or server-only code.
describe("resolvePostLoginPath (BD-03)", () => {
  it("routes each portal role to its own dashboard", () => {
    expect(resolvePostLoginPath("BROKER_USER")).toBe("/broker/dashboard");
    expect(resolvePostLoginPath("MEMBER_USER")).toBe("/member/dashboard");
    expect(resolvePostLoginPath("HR_MANAGER")).toBe("/hr/dashboard");
    expect(resolvePostLoginPath("FUND_ADMINISTRATOR")).toBe("/fund/dashboard");
    expect(resolvePostLoginPath("PROVIDER_USER")).toBe("/provider/dashboard");
  });

  it("routes staff roles to the staff dashboard", () => {
    expect(resolvePostLoginPath("SUPER_ADMIN")).toBe("/dashboard");
    expect(resolvePostLoginPath("CLAIMS_OFFICER")).toBe("/dashboard");
    expect(resolvePostLoginPath("FINANCE_OFFICER")).toBe("/dashboard");
  });

  // DEF-003: a reports viewer holds READ_REPORTS only; the staff dashboard put
  // claimant/provider/amount rows on their landing screen.
  it("routes a reports viewer to the reports surface, not the dashboard", () => {
    expect(resolvePostLoginPath("REPORTS_VIEWER")).toBe("/reports");
  });

  it("falls back to the staff dashboard for a missing/unknown role", () => {
    expect(resolvePostLoginPath(undefined)).toBe("/dashboard");
    expect(resolvePostLoginPath(null)).toBe("/dashboard");
    expect(resolvePostLoginPath("SOMETHING_ELSE")).toBe("/dashboard");
  });
});
