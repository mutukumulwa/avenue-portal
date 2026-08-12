/**
 * E2E-D01 regression: full-name member search. The registry query is built by
 * memberSearchClause; the page ANDs it with tenant/client/status filters, so
 * proving the clause matches "First Last" in either order is sufficient.
 */
import { describe, it, expect } from "vitest";
import {
  MEMBER_SEARCH_RESULT_CAP,
  memberSearchClause,
  memberSearchTake,
} from "@/lib/member-search";

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

/**
 * UAT-HF P05.07 acceptance — "equivalent formats find the same authorized
 * record; out-of-scope records never change result shape or timing materially."
 *
 * DEF-030: 'Searching ... for "0772555042" — the exact string that was entered,
 * and the form a member reads from their own handset — returns "0 of 2772
 * results" ... Storage normalises the local form; search does not.'
 * DEF-064: "the dash-less form of the same number returns 0 results".
 */
describe("P05.07 DEF-030 — a phone finds its member in any Uganda format", () => {
  const clausesFor = (q: string) => {
    const where = memberSearchClause(q);
    return (where.OR ?? []) as Record<string, unknown>[];
  };
  const has = (q: string, pred: (c: Record<string, any>) => boolean) =>
    clausesFor(q).some(pred);

  it.each(["0772555042", "+256772555042", "256772555042"])(
    "%s probes the canonical +256772555042 key",
    (q) => {
      expect(has(q, (c) => c.phoneNormalized === "+256772555042")).toBe(true);
    },
  );

  it("the local form the run searched with now reaches the stored key", () => {
    // This exact string returned "0 of 2772 results".
    expect(has("0772555042", (c) => c.phoneNormalized === "+256772555042")).toBe(true);
  });

  it("still probes the raw column, so rows written before the backfill match", () => {
    const raw = clausesFor("0772555042").find((c) => Array.isArray((c as any).phone?.in));
    expect((raw as any).phone.in).toContain("+256772555042");
    expect((raw as any).phone.in).toContain("0772555042");
  });

  it("a bare mid-number fragment matches inside the canonical key", () => {
    expect(has("772555042", (c) => c.phoneNormalized?.contains === "772555042")).toBe(true);
  });

  it("a non-phone token does not get a phone-equality probe", () => {
    expect(has("Kato", (c) => typeof c.phoneNormalized === "string")).toBe(false);
  });
});

describe("P05.07 DEF-064 — a member number resolves with or without its dashes", () => {
  const normalizedProbe = (q: string) =>
    ((memberSearchClause(q).OR ?? []) as Record<string, any>[]).find(
      (c) => c.memberNumberNormalized !== undefined,
    );

  it.each(["UX26-2026-00037", "UX26202600037"])(
    "%s probes the same punctuation-free key",
    (q) => {
      expect(normalizedProbe(q)?.memberNumberNormalized.contains).toBe("UX26202600037");
    },
  );

  it("a SPACE-separated member number becomes an AND of tokens that all match it", () => {
    // Spaces split into tokens, so this takes the multi-token path rather than
    // the single-key one — every part must still hit the normalized column, or
    // a number read out over the phone in groups would not resolve.
    const where = memberSearchClause("ux26 2026 00037");
    const groups = (where.AND ?? []) as { OR: Record<string, any>[] }[];
    expect(groups).toHaveLength(3);
    for (const [i, expected] of ["UX26", "2026", "00037"].entries()) {
      expect(
        groups[i].OR.some((c) => c.memberNumberNormalized?.contains === expected),
        expected,
      ).toBe(true);
    }
  });

  it("keeps the raw dashed probe too, so nothing that worked stops working", () => {
    const raw = ((memberSearchClause("UX26-2026-00037").OR ?? []) as Record<string, any>[]).find(
      (c) => c.memberNumber !== undefined,
    );
    expect(raw?.memberNumber.contains).toBe("UX26-2026-00037");
  });
});

describe("P05.07 national ID and email fold the same way as storage", () => {
  const probe = (q: string, key: string) =>
    ((memberSearchClause(q).OR ?? []) as Record<string, any>[]).find((c) => c[key] !== undefined);

  it("folds spacing and case in a national ID", () => {
    expect(probe("ck1234", "nationalIdNormalized")?.nationalIdNormalized.contains).toBe("CK1234");
  });

  it("matches an email case-insensitively on the canonical key", () => {
    expect(probe("A@B.com", "emailNormalized")?.emailNormalized).toBe("a@b.com");
  });

  it("does not add an email probe for a token that is not one", () => {
    expect(probe("Kato", "emailNormalized")).toBeUndefined();
  });
});

describe("P05.07 enumeration guards", () => {
  it("caps the result set", () => {
    expect(memberSearchTake(undefined)).toBe(MEMBER_SEARCH_RESULT_CAP);
    expect(memberSearchTake(10_000)).toBe(MEMBER_SEARCH_RESULT_CAP);
    expect(memberSearchTake(25)).toBe(25);
    expect(memberSearchTake(0)).toBe(MEMBER_SEARCH_RESULT_CAP);
    expect(memberSearchTake(-5)).toBe(MEMBER_SEARCH_RESULT_CAP);
  });

  it("will not substring-match on a single character", () => {
    // "a" would match most of the register and turn the search box into an
    // export of it.
    const clauses = (memberSearchClause("a").OR ?? []) as Record<string, any>[];
    expect(clauses.some((c) => c.firstName?.contains === "a")).toBe(false);
  });

  it("still allows a short EXACT identifier, which is a real query", () => {
    const clauses = (memberSearchClause("42").OR ?? []) as Record<string, any>[];
    expect(clauses.some((c) => c.memberNumberNormalized?.contains === "42")).toBe(true);
  });

  it("never contains a tenant, client or provider filter of its own", () => {
    // The caller composes scope. A search clause that quietly widened it would
    // be far worse than the defect being fixed.
    const serialised = JSON.stringify(memberSearchClause("0772555042 Kato"));
    expect(serialised).not.toMatch(/tenantId|clientId|providerId/);
  });
});
