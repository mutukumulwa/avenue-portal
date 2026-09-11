/**
 * DEC-FH-X11 on the TPA dashboard, whose figures come from raw SQL: "Claims
 * This Month", the monthly volume and billed/approved charts and the loss ratio
 * leave out withdrawn and superseded claims; "Pending Claims" and the recent
 * activity list are unchanged. (The same SQL was run against a seeded Postgres
 * when this was built: two claims moved to WITHDRAWN/SUPERSEDED left every one of
 * those figures exactly two claims and their billed amount lower.)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const authMock = vi.hoisted(() => ({ getCachedSession: vi.fn() }));
const prismaMock = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("@/lib/auth", () => authMock);
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/perf", () => ({ measureAsync: <T,>(_label: string, work: () => Promise<T>) => work() }));

import DashboardPage from "@/app/(admin)/dashboard/page";

type SqlFragment = { sql: string; values: unknown[]; strings: string[] };
const isFragment = (v: unknown): v is SqlFragment =>
  typeof v === "object" && v !== null && Array.isArray((v as SqlFragment).strings) && Array.isArray((v as SqlFragment).values);

/** Each query the page ran, with interpolated fragments inlined and parameters as `?`. */
function executed(): { sql: string; params: unknown[] }[] {
  return prismaMock.$queryRaw.mock.calls.map(([strings, ...values]) => {
    let sql = "";
    const params: unknown[] = [];
    (strings as string[]).forEach((part, i) => {
      sql += part;
      if (i >= values.length) return;
      const value = values[i];
      if (isFragment(value)) {
        sql += value.sql;
        params.push(...value.values);
      } else {
        sql += "?";
        params.push(value);
      }
    });
    return { sql: sql.replace(/\s+/g, " "), params };
  });
}

const EXCLUDES = /status::text NOT IN \(\?,\?\)/;

beforeEach(() => {
  vi.clearAllMocks();
  authMock.getCachedSession.mockResolvedValue({ user: { id: "u1", role: "SUPER_ADMIN", tenantId: "t1" } });
  prismaMock.$queryRaw.mockResolvedValue([]);
});

describe("DEC-FH-X11 — TPA dashboard totals", () => {
  it("\"Claims This Month\" leaves them out; \"Pending Claims\" is unchanged", async () => {
    await DashboardPage();
    const counts = executed().find((q) => q.sql.includes('AS "recentClaims"'))!;
    expect(counts.sql).toMatch(/"createdAt" >= \? AND status::text NOT IN \(\?,\?\)\) AS "recentClaims"/);
    expect(counts.sql).toMatch(/status IN \('RECEIVED','UNDER_REVIEW'\)\) AS "pendingClaims"/);
    expect(counts.params).toEqual(expect.arrayContaining(["WITHDRAWN", "SUPERSEDED"]));
  });

  it("both monthly charts and the loss ratio leave them out", async () => {
    await DashboardPage();
    const totals = executed().filter((q) => /DATE_TRUNC|SUM\("billedAmount"\)/.test(q.sql));
    expect(totals).toHaveLength(3); // volume chart, money chart, loss ratio
    for (const q of totals) {
      expect(q.sql).toMatch(EXCLUDES);
      expect(q.params).toEqual(expect.arrayContaining(["WITHDRAWN", "SUPERSEDED"]));
    }
  });

  it("the recent activity list still shows every claim", async () => {
    await DashboardPage();
    const recent = executed().find((q) => /JOIN "Member"/.test(q.sql))!;
    expect(recent.sql).not.toMatch(/NOT IN/);
  });
});
