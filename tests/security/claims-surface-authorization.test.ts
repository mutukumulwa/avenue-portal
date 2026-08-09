/**
 * WP-3 — every claims-domain surface must fail closed for a Membership Officer.
 *
 * DEF-003 acceptance tests 3 and 4 require that direct navigation to claims
 * routes, and direct invocation of claims server actions, are denied — not
 * merely unlinked. Before WP-3 the whole claims surface was ROLES.OPS-gated and
 * ROLES.OPS contained CUSTOMER_SERVICE, so those tests failed regardless of
 * what the dashboard rendered.
 *
 * This is a STATIC scan of the guards each route declares. It cannot be
 * satisfied by hiding navigation, and it fails the moment a new claims file
 * ships with a guard that admits the wrong role.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { ROLES, type UserRole } from "@/lib/authz/roles";
import { ALL_ROLES, CLAIM_READ_ROLES, CLAIM_DENIED_ROLES } from "./persona-authority-matrix";

const ADMIN_ROOT = resolve(__dirname, "../../src/app/(admin)");

/** Route segments whose contents are claims work, not membership work. */
const CLAIMS_DOMAIN = ["claims", "cases", "fraud", "lou", "overrides", "offline-capture", "offline-auth"];

/**
 * FINANCE_OFFICER is denied individual-claim READ authority by the persona
 * matrix (it is not in CLAIM_READ_ROLES), yet finance legitimately reaches ONE
 * narrow claims-domain surface — the claim REIMBURSEMENT action — gated by
 * ROLES.FINANCE (SUPER_ADMIN + FINANCE_OFFICER); see
 * src/app/(admin)/claims/[id]/reimbursement-actions.ts and the "narrower
 * role-specific sets" note below. This is a documented, pre-existing route-axis
 * carve-out. Every OTHER non-claim-read role must never reach ANY claims surface.
 */
const FINANCE_CLAIM_REIMBURSEMENT_CARVE_OUT: UserRole[] = ["FINANCE_OFFICER"];

/**
 * Roles that must never reach a claims surface (decision D1 Branch A + DEF-003
 * + DEF-004). Derived from the approved persona matrix (CLAIM_DENIED_ROLES) so
 * adding a role back into claim access, or adding a new uncategorised role,
 * fails here too — minus only the documented finance-reimbursement carve-out.
 */
const MUST_BE_DENIED: UserRole[] = CLAIM_DENIED_ROLES.filter(
  (r) => !FINANCE_CLAIM_REIMBURSEMENT_CARVE_OUT.includes(r),
);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const claimsFiles = walk(ADMIN_ROOT).filter((f) => {
  const rel = f.slice(ADMIN_ROOT.length + 1);
  return CLAIMS_DOMAIN.includes(rel.split(sep)[0]);
});

/** The ROLES.* set names each requireRole call in a file refers to. */
function guardSets(src: string): string[] {
  return [...src.matchAll(/requireRole\(\s*ROLES\.([A-Z_]+)/g)].map((m) => m[1]);
}

const guardedFiles = claimsFiles
  .map((f) => ({ file: f, rel: f.slice(ADMIN_ROOT.length + 1), sets: guardSets(readFileSync(f, "utf8")) }))
  .filter((f) => f.sets.length > 0);

describe("WP-3 — claims surfaces fail closed", () => {
  it("found claims-domain files to check (guards against a vacuous suite)", () => {
    expect(claimsFiles.length).toBeGreaterThan(20);
    expect(guardedFiles.length).toBeGreaterThan(10);
  });

  it("no claims-domain guard still uses the deprecated ROLES.OPS", () => {
    const offenders = guardedFiles.filter((f) => f.sets.includes("OPS")).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it.each(MUST_BE_DENIED)("no claims-domain guard admits %s", (role) => {
    const offenders = guardedFiles
      .filter((f) => f.sets.some((set) => (ROLES[set as keyof typeof ROLES] as UserRole[] | undefined)?.includes(role)))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("every non-claim-read role is denied, save the documented finance carve-out (DEF-004 tripwire)", () => {
    // The union of the denied set and the single finance-reimbursement carve-out
    // must be EXACTLY every role outside CLAIM_READ_ROLES. A new UserRole added
    // to the enum but not categorised would break this equality.
    expect([...MUST_BE_DENIED, ...FINANCE_CLAIM_REIMBURSEMENT_CARVE_OUT].sort()).toEqual(
      [...ALL_ROLES.filter((r) => !CLAIM_READ_ROLES.includes(r))].sort(),
    );
    // UNDERWRITER specifically must now be denied (DEF-004).
    expect(MUST_BE_DENIED).toContain("UNDERWRITER");
  });

  it("every claims-domain guard names a set that exists", () => {
    for (const { rel, sets } of guardedFiles) {
      for (const set of sets) {
        expect(ROLES[set as keyof typeof ROLES], `${rel} references unknown ROLES.${set}`).toBeDefined();
      }
    }
  });

  it("no claims-domain guard uses a broad or membership-shaped set", () => {
    // A claims surface must never be gated by "any staff" or by the membership
    // set — those are exactly the sets that contain the Membership Officer.
    // Narrower role-specific sets (FINANCE on claim reimbursement, ADMIN_ONLY)
    // are legitimate and intentionally allowed through.
    const BROAD = ["ANY_STAFF", "MEMBER_OPS", "OPS", "APPROVALS"];
    const offenders = guardedFiles
      .filter((f) => f.sets.some((s) => BROAD.includes(s)))
      .map((f) => `${f.rel} → ${f.sets.join(",")}`);
    expect(offenders).toEqual([]);
  });
});

describe("WP-3 — membership surfaces keep the Membership Officer", () => {
  const MEMBERSHIP_DOMAIN = ["members", "groups", "endorsements"];
  const membershipGuards = walk(ADMIN_ROOT)
    .filter((f) => MEMBERSHIP_DOMAIN.includes(f.slice(ADMIN_ROOT.length + 1).split(sep)[0]))
    .map((f) => ({ rel: f.slice(ADMIN_ROOT.length + 1), sets: guardSets(readFileSync(f, "utf8")) }))
    .filter((f) => f.sets.length > 0);

  it("found membership files to check", () => {
    expect(membershipGuards.length).toBeGreaterThan(10);
  });

  it("no membership surface was reclassified into the claims sets", () => {
    // The split must not have swept a membership file into CLAIMS_*, which
    // would lock the Membership Officer out of their own job (D1 Branch A).
    const offenders = membershipGuards
      .filter((f) => f.sets.some((s) => s === "CLAIMS_OPS" || s === "CLAIMS_READ"))
      .map((f) => `${f.rel} → ${f.sets.join(",")}`);
    expect(offenders).toEqual([]);
  });

  it("the core membership surfaces still admit CUSTOMER_SERVICE", () => {
    // Some files under members/ and groups/ are legitimately finance or
    // underwriting work (fund operations, group transfers) and were already
    // gated more tightly than OPS before this change. The guard here is that
    // the primary membership screens remain reachable.
    const CORE = ["members/page.tsx", "members/new/page.tsx", "groups/page.tsx", "endorsements/page.tsx"];
    for (const rel of CORE) {
      const entry = membershipGuards.find((f) => f.rel.split(sep).join("/") === rel);
      expect(entry, `${rel} not found or unguarded`).toBeDefined();
      const admits = entry!.sets.some((s) =>
        (ROLES[s as keyof typeof ROLES] as UserRole[] | undefined)?.includes("CUSTOMER_SERVICE"),
      );
      expect(admits, `${rel} no longer admits CUSTOMER_SERVICE`).toBe(true);
    }
  });
});
