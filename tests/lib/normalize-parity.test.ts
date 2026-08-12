/**
 * UAT-HF P05.01 — the migration backfill and the TypeScript writers must
 * produce the SAME key for the same person.
 *
 * DEF-030 is what happens when two definitions of "the same value" exist:
 * "Storage normalises the local form; search does not." A member enrolled as
 * "0772555042" was stored "+256772555042" and could not be found by the number
 * they were enrolled with.
 *
 * So this pins the SQL in `20260812000700_member_canonical_identity` to
 * `memberIdentityKeys`. It does not run the SQL — it asserts the SQL *text*
 * still contains the expressions these expectations were derived from, so a
 * change to one without the other fails here rather than in production six
 * months later.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  memberIdentityKeys,
  normalizeMemberNumber,
  normalizeSearchName,
} from "@/lib/normalize";

const MIGRATION = "prisma/migrations/20260812000700_member_canonical_identity/migration.sql";

describe("P05.01 phone keys — DEF-030's exact case", () => {
  it.each([
    ["0772555042", "+256772555042"],
    ["+256772555042", "+256772555042"],
    ["256772555042", "+256772555042"],
    ["0700 123 456", "+256700123456"],
    ["+256 (700) 123-456", "+256700123456"],
  ])("%s -> %s", (raw, expected) => {
    expect(memberIdentityKeys({ phone: raw }).phoneNormalized).toBe(expected);
  });

  it("the run's member is now findable by the number they were enrolled with", () => {
    // Enrolled "0772555042", stored "+256772555042", searched "0772555042",
    // got "0 of 2772 results". Both sides now produce one key.
    const stored = memberIdentityKeys({ phone: "0772555042" }).phoneNormalized;
    const searched = memberIdentityKeys({ phone: "0772555042" }).phoneNormalized;
    expect(stored).toBe(searched);
    expect(memberIdentityKeys({ phone: "+256772555042" }).phoneNormalized).toBe(stored);
  });

  it("leaves an unparseable number unkeyed rather than storing it wrong", () => {
    expect(memberIdentityKeys({ phone: "12345" }).phoneNormalized).toBeNull();
    expect(memberIdentityKeys({ phone: "not a phone" }).phoneNormalized).toBeNull();
    expect(memberIdentityKeys({ phone: "   " }).phoneNormalized).toBeNull();
  });
});

describe("P05.01 member-number keys — DEF-064", () => {
  it("the dashed and dash-less forms produce one key", () => {
    expect(normalizeMemberNumber("UX26-2026-00037")).toBe("UX26202600037");
    expect(normalizeMemberNumber("ux26202600037")).toBe("UX26202600037");
    expect(normalizeMemberNumber("UX26 2026 00037")).toBe("UX26202600037");
  });
});

describe("P05.01 national ID and email keys", () => {
  it("folds case and interior spaces in a national ID", () => {
    expect(memberIdentityKeys({ idNumber: " ck 12 34 " }).nationalIdNormalized).toBe("CK1234");
    expect(memberIdentityKeys({ idNumber: "CK1234" }).nationalIdNormalized).toBe("CK1234");
  });

  it("folds email case", () => {
    expect(memberIdentityKeys({ email: " A@B.com " }).emailNormalized).toBe("a@b.com");
  });

  it("returns null for absent values, so the unique index ignores them", () => {
    // Newborns enrol without a national ID (CT-033); NULLs are distinct in a
    // Postgres unique index, so any number of them coexist.
    const keys = memberIdentityKeys({});
    expect(keys.nationalIdNormalized).toBeNull();
    expect(keys.emailNormalized).toBeNull();
  });
});

describe("P05.01 search-name key", () => {
  it("joins the names, casefolds, and collapses whitespace", () => {
    expect(normalizeSearchName({ firstName: "Amina", otherNames: "", lastName: "Kato" })).toBe(
      "amina kato",
    );
    expect(
      normalizeSearchName({ firstName: " Amina ", otherNames: "Nabirye", lastName: "KATO" }),
    ).toBe("amina nabirye kato");
  });

  it("is null rather than empty when there is no name at all", () => {
    expect(memberIdentityKeys({}).searchNameNormalized).toBeNull();
  });
});

describe("P05.01 the SQL backfill still matches these definitions", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("keys phones with the same three-branch Uganda rule", () => {
    expect(sql).toContain("^0\\d{9}$");
    expect(sql).toContain("^256\\d{9}$");
    expect(sql).toContain("'+256' ||");
  });

  it("strips the same characters before matching a phone", () => {
    // TypeScript strips whitespace, parens, hyphens and a leading '+'.
    expect(sql).toContain("[\\s()\\-+]");
  });

  it("uppercases and strips whitespace for the national ID", () => {
    expect(sql).toContain(`upper(btrim("idNumber"))`);
  });

  it("strips non-alphanumerics from the member number", () => {
    expect(sql).toContain("[^A-Z0-9]");
  });

  it("builds the search name from first + other + last, collapsed", () => {
    expect(sql).toContain(`coalesce("firstName", '')`);
    expect(sql).toContain(`coalesce("otherNames", '')`);
    expect(sql).toContain(`coalesce("lastName", '')`);
  });

  it("is additive only — the unique index is a separate, gated migration", () => {
    // A unique that fails mid-deploy on real duplicates is worse than none.
    expect(sql).not.toContain("CREATE UNIQUE INDEX");
    const gated = readFileSync(
      "prisma/migrations/20260812000800_member_national_id_unique/migration.sql",
      "utf8",
    );
    expect(gated).toContain("CREATE UNIQUE INDEX");
    expect(gated).toContain("member-identity-preflight");
  });

  it("constrains the national ID only — never phone or name+DOB (DEC-07)", () => {
    const gated = readFileSync(
      "prisma/migrations/20260812000800_member_national_id_unique/migration.sql",
      "utf8",
    );
    expect(gated).toContain("nationalIdNormalized");
    expect(gated).not.toMatch(/CREATE UNIQUE INDEX[^;]*phoneNormalized/);
    expect(gated).not.toMatch(/CREATE UNIQUE INDEX[^;]*dateOfBirth/);
  });
});
