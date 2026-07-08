/**
 * E2E-D01 regression: full-name member search. The registry query is built by
 * memberSearchClause; the page ANDs it with tenant/client/status filters, so
 * proving the clause matches "First Last" in either order is sufficient.
 */
import { describe, it, expect } from "vitest";
import { memberSearchClause } from "@/lib/member-search";

type M = { firstName: string; lastName: string; memberNumber: string; email?: string; phone?: string; idNumber?: string; groupName?: string };

const MARK: M = { firstName: "Mark", lastName: "Kato", memberNumber: "NWSC-2026-01768", groupName: "NWSC Senior" };
const ANGELA: M = { firstName: "Angela", lastName: "Kato", memberNumber: "NWSC-2026-00042", groupName: "NWSC Junior" };

// Minimal evaluator for the OR/AND/contains shapes this clause produces.
function contains(cond: any, m: M): boolean {
  if (cond.firstName) return m.firstName.toLowerCase().includes(cond.firstName.contains.toLowerCase());
  if (cond.lastName) return m.lastName.toLowerCase().includes(cond.lastName.contains.toLowerCase());
  if (cond.memberNumber) return m.memberNumber.toLowerCase().includes(cond.memberNumber.contains.toLowerCase());
  if (cond.email) return (m.email ?? "").toLowerCase().includes(cond.email.contains.toLowerCase());
  if (cond.phone) return (m.phone ?? "").toLowerCase().includes(cond.phone.contains.toLowerCase());
  if (cond.idNumber) return (m.idNumber ?? "").toLowerCase().includes(cond.idNumber.contains.toLowerCase());
  if (cond.group) return (m.groupName ?? "").toLowerCase().includes(cond.group.name.contains.toLowerCase());
  return false;
}
function matches(where: any, m: M): boolean {
  if (where.OR) return (where.OR as any[]).some((c) => contains(c, m));
  if (where.AND) return (where.AND as any[]).every((c) => matches(c, m));
  return true; // empty clause matches everyone
}

describe("memberSearchClause (E2E-D01)", () => {
  it("single token 'Mark' finds Mark Kato", () => {
    expect(matches(memberSearchClause("Mark"), MARK)).toBe(true);
  });

  it("single token 'Kato' finds Mark Kato", () => {
    expect(matches(memberSearchClause("Kato"), MARK)).toBe(true);
  });

  it("full name 'Mark Kato' finds Mark Kato", () => {
    expect(matches(memberSearchClause("Mark Kato"), MARK)).toBe(true);
  });

  it("reversed 'Kato Mark' also finds Mark Kato (order-insensitive)", () => {
    expect(matches(memberSearchClause("Kato Mark"), MARK)).toBe(true);
  });

  it("'Mark Kato' does NOT match Angela Kato (every token must match)", () => {
    expect(matches(memberSearchClause("Mark Kato"), ANGELA)).toBe(false);
  });

  it("member number still resolves the exact member", () => {
    expect(matches(memberSearchClause("NWSC-2026-01768"), MARK)).toBe(true);
    expect(matches(memberSearchClause("NWSC-2026-01768"), ANGELA)).toBe(false);
  });

  it("blank query yields an empty clause (matches everyone)", () => {
    expect(memberSearchClause("   ")).toEqual({});
  });

  it("extra whitespace between tokens is ignored", () => {
    expect(matches(memberSearchClause("  Mark   Kato  "), MARK)).toBe(true);
  });
});
