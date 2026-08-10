/**
 * PRIVACY-S1-B (N3) — HR reads must guard an undefined groupId and scope by
 * tenantId.
 *
 * SUPER_ADMIN is in ROLES.HR, and ungrouped HR users exist, so a
 * `groupId: session.user.groupId!` non-null assertion is a lie: Prisma DROPS an
 * undefined key and the query degrades to a cross-group AND cross-tenant read
 * that renders DOB / idNumber / phone / email. This suite proves the roster
 * member-detail page fails closed (behavioural) and that all three N3 pages carry
 * the guard and drop the `!` (static tripwire — utilization/support take no id
 * param, so a static assertion is the durable guard there).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sessionHolder = vi.hoisted(() => ({ session: null as unknown }));
const db = vi.hoisted(() => ({
  member: { findFirst: vi.fn(async (_args: { where: Record<string, unknown> }) => null as unknown) },
}));
const nav = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/rbac", () => ({
  ROLES: { HR: ["HR_MANAGER", "SUPER_ADMIN"] },
  requireRole: vi.fn(async () => sessionHolder.session),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next/navigation", () => nav);

import HRMemberDetailPage from "@/app/(hr)/hr/roster/[memberId]/page";

const callPage = (memberId = "foreign-member") =>
  HRMemberDetailPage({ params: Promise.resolve({ memberId }) });

beforeEach(() => {
  vi.clearAllMocks();
  db.member.findFirst.mockResolvedValue(null);
});

describe("N3 — HR member detail cannot load a foreign member with an undefined groupId", () => {
  it("undefined groupId → notFound() BEFORE any member query is issued", async () => {
    sessionHolder.session = { user: { id: "u1", tenantId: "t1", role: "SUPER_ADMIN", groupId: undefined } };
    await expect(callPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(nav.notFound).toHaveBeenCalled();
    expect(db.member.findFirst).not.toHaveBeenCalled();
  });

  it("with a groupId → the member query is scoped by BOTH tenantId and groupId", async () => {
    sessionHolder.session = { user: { id: "u1", tenantId: "t1", role: "HR_MANAGER", groupId: "g1" } };
    await expect(callPage("foreign-member")).rejects.toThrow("NEXT_NOT_FOUND"); // not in group → null → notFound
    expect(db.member.findFirst).toHaveBeenCalledTimes(1);
    const arg = db.member.findFirst.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: "foreign-member", tenantId: "t1", groupId: "g1" });
  });
});

describe("N3 — the three HR pages guard groupId and never use groupId!", () => {
  const ROOT = resolve(__dirname, "../../src/app/(hr)/hr");
  const files: Record<string, string> = {
    roster: `${ROOT}/roster/[memberId]/page.tsx`,
    utilization: `${ROOT}/utilization/page.tsx`,
    support: `${ROOT}/support/page.tsx`,
  };

  it.each(Object.entries(files))("%s guards !groupId with notFound and drops the ! assertion", (_name, file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/if\s*\(\s*!session\.user\.groupId\s*\)\s*notFound\(\)/);
    expect(src).not.toMatch(/session\.user\.groupId!/);
  });

  it("roster member query is scoped by tenantId", () => {
    expect(readFileSync(files.roster, "utf8")).toMatch(/tenantId:\s*session\.user\.tenantId/);
  });
});
