import { describe, it, expect } from "vitest";
import {
  PROVIDER_ROLE_PERMISSIONS,
  PROVIDER_PERMISSIONS,
  PROVIDER_PERSONA_ROLE_CODES,
} from "../../prisma/seeds/provider-rbac";

/**
 * UAT-HF DEC-15 — the facility administrator role.
 *
 * The six persona bundles model a provider with six kinds of staff. The actual
 * shape, per a provider meeting on 2026-08-13, is one or two people doing all of
 * it. Assembling that from six bundles — through a UI that cannot grant a role
 * at all (DEC-16) — is how a permission model becomes something people work
 * around instead of with.
 *
 * These tests pin the two properties that make a deliberately broad role
 * defensible: it is complete, and it collapses no separation of duties.
 */

const CATALOGUE = PROVIDER_PERMISSIONS.map((p) => p.code);
const FACILITY_ADMIN = PROVIDER_ROLE_PERMISSIONS.PROVIDER_FACILITY_ADMIN;

describe("it covers the whole facility", () => {
  it("holds every provider permission", () => {
    expect([...FACILITY_ADMIN].sort()).toEqual([...CATALOGUE].sort());
  });

  it("grants nothing outside the provider catalogue", () => {
    // A typo here would create a permission that no seed defines and no check
    // matches — silently dead, like the four this branch had to rescue.
    expect(FACILITY_ADMIN.filter((c) => !CATALOGUE.includes(c))).toEqual([]);
  });

  it("has no duplicates", () => {
    expect(FACILITY_ADMIN.length).toBe(new Set(FACILITY_ADMIN).size);
  });

  it("is assignable to a new provider user", () => {
    // PROVIDER_LEGACY is deliberately excluded from this list; the new role
    // must be in it or nobody can be given it.
    expect(PROVIDER_PERSONA_ROLE_CODES).toContain("PROVIDER_FACILITY_ADMIN");
  });

  it("supersedes every persona — each is a strict subset", () => {
    for (const code of PROVIDER_PERSONA_ROLE_CODES) {
      if (code === "PROVIDER_FACILITY_ADMIN") continue;
      const persona = PROVIDER_ROLE_PERMISSIONS[code];
      const missing = persona.filter((p) => !FACILITY_ADMIN.includes(p));
      expect(missing, `${code} has permissions the facility admin lacks`).toEqual([]);
    }
  });
});

describe("it collapses no separation of duties", () => {
  it("cannot approve its own profile change", () => {
    // `change_request` REQUESTS; the TPA approves. If an approve permission
    // ever lands in this catalogue, holding both would be self-approval and
    // this test should fail loudly rather than the role quietly widening.
    expect(FACILITY_ADMIN).toContain("provider.profile.change_request");
    expect(CATALOGUE.filter((c) => /\.(approve|activate|verify)$/.test(c))).toEqual([]);
  });

  it("holds no TPA-side permission", () => {
    // Bank-change verification/activation and network analytics are the TPA's.
    // Every code here must be provider-scoped by construction.
    expect(FACILITY_ADMIN.every((c) => c.startsWith("provider."))).toBe(true);
  });

  it("does not answer DEC-15's harder question", () => {
    // Termination, fraud and breach need a checker who is not the maker. Those
    // are member-lifecycle transitions, not provider permissions — so this role
    // does not, and must not appear to, resolve them.
    expect(FACILITY_ADMIN.some((c) => c.includes("lifecycle") || c.includes("terminate"))).toBe(false);
  });
});

describe("provider.preauth.cancel", () => {
  it("is now held by somebody", () => {
    // It sat in the catalogue with no holder, so no one could cancel a
    // pre-authorisation — the same defect as the four permissions this branch
    // had to grant. Asserted separately because it is a fix, not a side effect.
    const holders = Object.entries(PROVIDER_ROLE_PERMISSIONS)
      .filter(([, perms]) => perms.includes("provider.preauth.cancel"))
      .map(([role]) => role);
    expect(holders).toContain("PROVIDER_FACILITY_ADMIN");
  });

  it("is still absent from the narrow personas, which is deliberate", () => {
    // Widening front desk or clinician is a separate decision with its own
    // reasoning; this role exists precisely so that decision is not forced.
    expect(PROVIDER_ROLE_PERMISSIONS.PROVIDER_FRONT_DESK).not.toContain("provider.preauth.cancel");
    expect(PROVIDER_ROLE_PERMISSIONS.PROVIDER_CLINICIAN).not.toContain("provider.preauth.cancel");
  });
});
