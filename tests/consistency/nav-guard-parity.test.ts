/**
 * WP-3.5 / GAP-13 — navigation ⊆ page guard.
 *
 * Every AdminSidebar nav item is shown to a set of roles (`roles: <SET>`). The
 * page it links to independently authorizes with `requireRole(ROLES.<SET>)`.
 * Nothing cross-checked the two, so four links (Offline Capture, Offline Work
 * Codes, Override Queue, Fraud Alerts) were shown to CUSTOMER_SERVICE/UNDERWRITER
 * while their CLAIMS_READ-guarded pages denied them — dead links to Access
 * Denied that survived two prior waves.
 *
 * This suite fails the build whenever a nav item advertises a link to a role the
 * target page's guard rejects (nav-roles ⊄ page-guard-roles). It is a STATIC
 * scan — it can only be satisfied by making the nav honest, never by hiding a
 * link, and it fixes the class, not just the four instances.
 *
 * Direction matters: nav MUST be a subset of the guard (never widen a guard to
 * match nav — claims-surface-authorization.test.ts pins that). A guard broader
 * than the nav (a page reachable by URL but unlinked for a role) is allowed here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROLES, type UserRole } from "@/lib/authz/roles";

const ROOT = resolve(__dirname, "../..");
const APP = join(ROOT, "src", "app");
const SIDEBAR = join(ROOT, "src", "components", "layouts", "AdminSidebar.tsx");

// ── AdminSidebar: local alias → ROLES key, then nav items (href, alias) ───────
const sidebarSrc = readFileSync(SIDEBAR, "utf8");

/** `const OPS = ROLES.MEMBER_OPS;` → { OPS: "MEMBER_OPS" } */
const aliasToRolesKey: Record<string, string> = {};
for (const m of sidebarSrc.matchAll(/const\s+(\w+)\s*=\s*ROLES\.(\w+)\s*;/g)) {
  aliasToRolesKey[m[1]] = m[2];
}

/** Nav items carry `href: "..." ... roles: <ALIAS>` on one line; children have no roles. */
interface NavItem { href: string; alias: string; }
const navItems: NavItem[] = [];
for (const m of sidebarSrc.matchAll(/href:\s*"([^"]+)"[^\n]*?\broles:\s*([A-Za-z_]+)/g)) {
  navItems.push({ href: m[1], alias: m[2] });
}

// ── src/app: route path (route groups/parallel slots stripped) → page guards ──
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry === "page.tsx" && !full.includes(" 2.")) out.push(full);
  }
  return out;
}

function routePathOf(file: string): string {
  const rel = file.slice(APP.length + 1).replace(/\/page\.tsx$/, "");
  const segs = rel.split("/").filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith("@"));
  return "/" + segs.join("/");
}

/** Every ROLES.<SET> named by a requireRole call in the file (direct or dynamic import). */
function guardSetsOf(file: string): string[] {
  const src = readFileSync(file, "utf8");
  return [...new Set([...src.matchAll(/requireRole\(\s*ROLES\.([A-Z_]+)/g)].map((m) => m[1]))];
}

const routeMap = new Map<string, { file: string; guards: string[] }>();
for (const file of walk(APP).sort()) {
  const rp = routePathOf(file);
  if (!routeMap.has(rp)) routeMap.set(rp, { file, guards: guardSetsOf(file) });
}

function rolesOf(setKey: string): UserRole[] {
  return (ROLES as Record<string, UserRole[]>)[setKey] ?? [];
}

describe("WP-3.5 — AdminSidebar nav items are a subset of their page guards", () => {
  it("parsed a meaningful nav surface (guards against a vacuous suite)", () => {
    expect(navItems.length).toBeGreaterThan(25);
    expect(Object.keys(aliasToRolesKey).length).toBeGreaterThan(5);
  });

  it("every nav alias maps to a real ROLES set", () => {
    for (const { alias } of navItems) {
      const key = aliasToRolesKey[alias];
      expect(key, `nav alias '${alias}' has no 'const ${alias} = ROLES.X' declaration`).toBeDefined();
      expect(rolesOf(key).length, `ROLES.${key} is empty/undefined`).toBeGreaterThan(0);
    }
  });

  it("every nav href resolves to a page that guards itself with requireRole", () => {
    const unresolved: string[] = [];
    const unguarded: string[] = [];
    for (const { href } of navItems) {
      const entry = routeMap.get(href);
      if (!entry) unresolved.push(href);
      else if (entry.guards.length === 0) unguarded.push(href);
    }
    expect(unresolved, `nav hrefs with no page.tsx:\n  ${unresolved.join("\n  ")}`).toEqual([]);
    expect(unguarded, `nav hrefs whose page has no requireRole:\n  ${unguarded.join("\n  ")}`).toEqual([]);
  });

  it("no nav item is shown to a role its target page's guard rejects (nav ⊆ guard)", () => {
    const offenders: string[] = [];
    for (const { href, alias } of navItems) {
      const entry = routeMap.get(href);
      if (!entry || entry.guards.length === 0) continue; // covered by the test above
      const navRoles = rolesOf(aliasToRolesKey[alias]);
      const guardRoles = new Set(entry.guards.flatMap(rolesOf));
      const leaked = navRoles.filter((r) => !guardRoles.has(r));
      if (leaked.length > 0) {
        offenders.push(`${href} (nav ${alias}) shows to [${leaked.join(", ")}] but the page guard is [${entry.guards.join(", ")}]`);
      }
    }
    expect(
      offenders,
      `Dead nav links — shown to a role the page denies:\n  ${offenders.join("\n  ")}\n` +
        "Narrow the sidebar `roles` to match the page guard — never widen the guard.",
    ).toEqual([]);
  });

  it("the four historically-dead links now resolve consistently (regression tripwire)", () => {
    for (const href of ["/offline-capture", "/offline-auth", "/overrides", "/fraud"]) {
      const item = navItems.find((n) => n.href === href);
      expect(item, `${href} missing from nav`).toBeDefined();
      const navRoles = rolesOf(aliasToRolesKey[item!.alias]);
      // These pages deny the Membership Officer and the Underwriter (CLAIMS_READ).
      expect(navRoles).not.toContain("CUSTOMER_SERVICE");
      expect(navRoles).not.toContain("UNDERWRITER");
    }
  });
});
