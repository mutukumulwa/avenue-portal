/**
 * DEF-003 (S1) — the admin dashboard must never QUERY claims data for a role
 * without claim-read authority.
 *
 * The original defect was not a rendering mistake: the page ran four tenant-wide
 * claims queries for every ANY_STAFF role and then filtered some components.
 * Claimant name, provider, claim number, billed amount and status therefore
 * reached the RSC payload for CUSTOMER_SERVICE, REPORTS_VIEWER and
 * FUND_ADMINISTRATOR regardless of what was rendered.
 *
 * So this suite asserts on the QUERIES EXECUTED, not on the markup — hiding a
 * component after the data has been fetched is not an authorization control
 * (brief §3.3). A second assertion pins that no claim-identifying value reaches
 * the returned element tree.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock only the session source and navigation, so the REAL requireRole and the
// REAL ROLES sets are exercised — the test then fails if either drifts.
const authMock = vi.hoisted(() => ({ getCachedSession: vi.fn() }));
const nav = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
const prismaMock = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
const perfMock = vi.hoisted(() => ({
  measureAsync: <T,>(_l: string, w: () => Promise<T>) => w(),
}));

vi.mock("@/lib/auth", () => authMock);
vi.mock("next/navigation", () => nav);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/perf", () => perfMock);

import DashboardPage from "@/app/(admin)/dashboard/page";
import {
  ALL_ROLES,
  CLAIM_READ_ROLES,
  CLAIM_DENIED_ROLES,
  MONEY_READ_ROLES,
  MONEY_DENIED_ROLES,
} from "./persona-authority-matrix";

/** Marker values that must never be fetched or rendered for an unauthorized role. */
const CLAIM_MARKERS = ["CLM-LEAK-0001", "Leakworthy", "Nakasero Hospital"];

/** Every SQL string the page executed, flattened. */
function executedSql(): string[] {
  return prismaMock.$queryRaw.mock.calls.map((call) => {
    const strings = call[0] as unknown as string[];
    return Array.isArray(strings) ? strings.join(" ") : String(strings);
  });
}

/**
 * Every string/number reachable in the returned element tree. React elements
 * carry circular refs (`_owner`, module namespaces), so this walks with a seen
 * set rather than JSON.stringify.
 */
function collectStrings(node: unknown, seen = new WeakSet<object>()): string[] {
  if (node == null) return [];
  if (typeof node === "string") return [node];
  if (typeof node === "number") return [String(node)];
  if (typeof node !== "object") return [];
  if (seen.has(node as object)) return [];
  seen.add(node as object);

  if (Array.isArray(node)) return node.flatMap((n) => collectStrings(n, seen));

  const el = node as { type?: unknown; props?: unknown };
  // Only descend through props — element internals hold module cycles.
  if (el.props !== undefined) return collectStrings(el.props, seen);

  return Object.values(node as Record<string, unknown>).flatMap((v) =>
    collectStrings(v, seen),
  );
}

function setRole(role: string) {
  authMock.getCachedSession.mockResolvedValue({
    user: { id: "u1", role, tenantId: "t1" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Any query that DOES run returns a claim-shaped row carrying the markers, so
  // a leak would be loud rather than silent.
  prismaMock.$queryRaw.mockResolvedValue([
    {
      activeMembers: 5, activeGroups: 2,
      pendingClaims: 7, recentClaims: 9,
      pendingPreauths: 3, overdueInvoices: 1,
      month: "Aug 26", claims: 4, billed: 1000, approved: 900,
      id: "c1", claimNumber: CLAIM_MARKERS[0],
      firstName: CLAIM_MARKERS[1], lastName: "Member",
      providerName: CLAIM_MARKERS[2], billedAmount: 250000, status: "APPROVED",
    },
  ]);
});

// Portfolio money aggregates — SUM() over the whole book. An individual claim's
// own billedAmount inside a Recent Claims row is claim data, not a portfolio
// aggregate, and is governed by CLAIMS_READ instead.
const AGGREGATE_SQL = /SUM\(\s*c?\.?"(billed|approved)Amount"/i;

/**
 * Runs the dashboard for the current role. A role the admin shell does not admit
 * at all (requireRole(ROLES.ANY_STAFF)) redirects — the strongest possible
 * denial, reached before any query runs. The test mock throws `REDIRECT:…`; we
 * treat that as a valid denied outcome and still assert on the (empty) query log.
 */
async function renderOrRedirect(): Promise<unknown> {
  try {
    return await DashboardPage();
  } catch (e) {
    expect(String((e as Error).message)).toMatch(/^REDIRECT:/);
    return null;
  }
}

describe("DEF-003 / DEF-004 — dashboard claims isolation (exhaustive over every role)", () => {
  // The claim axis: every one of the 12 roles falls in exactly one branch.
  describe.each(CLAIM_DENIED_ROLES)("%s (no claim-read authority)", (role) => {
    it("executes no INDIVIDUAL-claim query", async () => {
      setRole(role);
      await renderOrRedirect();

      // A money-authorised-but-claim-denied role (FINANCE_OFFICER) may still run
      // the portfolio SUM aggregate over "Claim" — that carries no claimant
      // identity. What must never run is a per-claim query (counts, recent rows,
      // the JOIN onto Member/Provider). AGGREGATE_SQL excludes only the
      // legitimate money aggregate, so for a role with no money authority this
      // is identical to "no Claim query at all" (the original DEF-003 check).
      const individualClaimQueries = executedSql().filter(
        (sql) => /"Claim"/.test(sql) && !AGGREGATE_SQL.test(sql),
      );
      expect(individualClaimQueries).toEqual([]);
    });

    it("never fetches identifiable claim rows (no JOIN onto Member)", async () => {
      setRole(role);
      await renderOrRedirect();
      expect(executedSql().filter((sql) => /JOIN "Member"/.test(sql))).toEqual([]);
    });

    it("renders no claim-identifying value", async () => {
      setRole(role);
      const tree = await renderOrRedirect();

      const text = collectStrings(tree).join(" | ");
      for (const marker of CLAIM_MARKERS) {
        expect(text).not.toContain(marker);
      }
    });
  });

  describe.each(CLAIM_READ_ROLES)("%s (claim-read authority)", (role) => {
    it("does query the Claim table", async () => {
      setRole(role);
      await DashboardPage();

      const claimQueries = executedSql().filter((sql) => /"Claim"/.test(sql));
      expect(claimQueries.length).toBeGreaterThan(0);
    });
  });

  // The money axis: SUM(billed/approved) aggregates require MONEY_READ.
  describe.each(MONEY_DENIED_ROLES)("%s (no money authority)", (role) => {
    it("fetches no money aggregate (SUM billed/approved)", async () => {
      setRole(role);
      await renderOrRedirect();
      expect(executedSql().filter((sql) => AGGREGATE_SQL.test(sql))).toEqual([]);
    });
  });

  describe.each(MONEY_READ_ROLES)("%s (money authority)", (role) => {
    it("does fetch money aggregates", async () => {
      setRole(role);
      await DashboardPage();
      expect(executedSql().filter((sql) => AGGREGATE_SQL.test(sql)).length).toBeGreaterThan(0);
    });
  });

  it("both axes together categorise every one of the 12 roles (DEF-004 tripwire)", () => {
    // A new UserRole neither approved nor denied would silently escape the
    // matrix — exactly the class of gap that let DEF-004 ship.
    expect([...CLAIM_READ_ROLES, ...CLAIM_DENIED_ROLES].sort()).toEqual([...ALL_ROLES].sort());
    expect([...MONEY_READ_ROLES, ...MONEY_DENIED_ROLES].sort()).toEqual([...ALL_ROLES].sort());
  });

  it("fetches membership counts for a membership role without touching claims", async () => {
    setRole("CUSTOMER_SERVICE");
    await DashboardPage();

    const sql = executedSql();
    expect(sql.some((s) => /"Member"/.test(s) && /activeMembers/.test(s))).toBe(true);
    expect(sql.some((s) => /"Claim"/.test(s))).toBe(false);
  });
});
