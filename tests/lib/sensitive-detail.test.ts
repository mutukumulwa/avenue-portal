/**
 * UAT-HF P11.05 acceptance — "default operator DOM/network payload lacks full
 * sensitive fields; authorized reveal is audited; unauthorized forged request
 * fails."
 *
 * DEF-080 (S2): "Opening a member profile renders, with no interaction at all:
 * the family unit inline ... so a MINOR dependant's full name, member number and
 * age appear on the principal's landing view — together with the national ID,
 * the date of birth, the full unmasked phone number and the financial position.
 * This is the screen an agent has open with a member standing at the counter,
 * and with anyone behind them able to read it."
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  AGE_OF_MAJORITY,
  MASKED_PLACEHOLDER,
  SENSITIVE_REVEAL_PERMISSION,
  ageOnly,
  isMinor,
  maskEmail,
  maskNationalId,
  maskPhone,
  mayReveal,
  summariseHousehold,
} from "@/lib/sensitive-detail";

const yearsAgo = (n: number) => new Date(Date.now() - n * 365.25 * 24 * 3600 * 1000);

describe("P11.05 masks keep enough to confirm, never enough to read off", () => {
  it("a national ID keeps only its last two characters", () => {
    // Enough to confirm a document someone is holding; not enough to
    // reconstruct, or for the person behind them to memorise.
    const masked = maskNationalId("CM12345678")!;
    expect(masked).toBe(`${MASKED_PLACEHOLDER}78`);
    expect(masked).not.toContain("123456");
  });

  it("a phone keeps the country shape and the last three digits", () => {
    const masked = maskPhone("+256772555042")!;
    expect(masked).toContain("042");
    expect(masked).not.toContain("772555");
  });

  it("an email keeps the first character and the domain", () => {
    expect(maskEmail("amina@example.com")).toBe(`a${MASKED_PLACEHOLDER}@example.com`);
  });

  it("returns null for an absent value rather than a mask of nothing", () => {
    // A masked empty field would imply there is something behind it.
    expect(maskNationalId(null)).toBeNull();
    expect(maskPhone("  ")).toBeNull();
    expect(maskEmail(undefined)).toBeNull();
  });

  it("does not leak a short value through the mask", () => {
    expect(maskNationalId("AB")).toBe(MASKED_PLACEHOLDER);
    expect(maskPhone("12")).toBe(MASKED_PLACEHOLDER);
    expect(maskEmail("@x.com")).toBe(MASKED_PLACEHOLDER);
  });
});

describe("P11.05 a date of birth becomes an age", () => {
  it("answers the operational question without being a credential", () => {
    expect(ageOnly(yearsAgo(36))).toBe("36y");
  });

  it("returns null for an unusable date rather than a wrong age", () => {
    expect(ageOnly(null)).toBeNull();
    expect(ageOnly("not a date")).toBeNull();
    expect(ageOnly(yearsAgo(200))).toBeNull();
  });

  it("identifies a minor", () => {
    expect(isMinor(yearsAgo(8))).toBe(true);
    expect(isMinor(yearsAgo(AGE_OF_MAJORITY + 1))).toBe(false);
  });
});

describe("P11.05 the household collapses to counts", () => {
  it("names nobody — the whole point of DEF-080", () => {
    const summary = summariseHousehold([{ dateOfBirth: yearsAgo(8) }, { dateOfBirth: yearsAgo(30) }]);
    // The run saw "Child OfValid UX26-2026-00031 Child · 8y" on the landing view.
    expect(summary.label).toBe("2 dependants (1 under 18)");
    expect(JSON.stringify(summary)).not.toMatch(/[A-Z]{2}\d{2}-\d{4}/); // no member numbers
  });

  it("counts minors without listing them", () => {
    const summary = summariseHousehold([{ dateOfBirth: yearsAgo(8) }, { dateOfBirth: yearsAgo(12) }]);
    expect(summary.minorCount).toBe(2);
    expect(summary.label).toContain("2 under 18");
  });

  it("says nothing about minors when there are none", () => {
    const summary = summariseHousehold([{ dateOfBirth: yearsAgo(30) }]);
    expect(summary.label).toBe("1 dependant");
  });

  it("handles an empty household", () => {
    expect(summariseHousehold([]).label).toBe("No dependants");
  });
});

describe("P11.05 the reveal is gated", () => {
  it("requires the explicit permission", () => {
    expect(mayReveal([SENSITIVE_REVEAL_PERMISSION])).toBe(true);
    expect(mayReveal(["members.read"])).toBe(false);
    expect(mayReveal(undefined)).toBe(false);
  });
});

describe("P11.05 DEC-10 — hidden data is never serialised", () => {
  const page = readFileSync("src/app/(admin)/members/[id]/page.tsx", "utf8");

  it("the profile payload carries MASKS, not values", () => {
    // "Hidden data must never be serialized into client HTML or network
    // payloads 'just to hide it with CSS'."
    expect(page).toContain("idNumber: maskNationalId(member.idNumber)");
    expect(page).toContain("phone: maskPhone(member.phone)");
    expect(page).toContain("email: maskEmail(member.email)");
  });

  it("the landing view gets household COUNTS, not the dependants", () => {
    expect(page).toContain("summaryLabel={summariseHousehold(member.dependents).label}");
    // The eager tree that rendered a minor's name with no interaction is gone.
    expect(page).not.toContain("<FamilyTreeView");
  });
});

describe("P11.05 the reveal action", () => {
  const actions = readFileSync("src/app/(admin)/members/[id]/reveal-actions.ts", "utf8");

  it("checks the permission BEFORE reading the value", () => {
    // An unauthorized request must not load what it may not see.
    const permissionAt = actions.indexOf("SENSITIVE_REVEAL_PERMISSION");
    const readAt = actions.indexOf("prisma.member.findFirst");
    expect(permissionAt).toBeGreaterThan(-1);
    expect(permissionAt).toBeLessThan(readAt);
  });

  it("refuses a forged field name", () => {
    expect(actions).toContain("REVEALABLE_FIELDS.includes(field)");
  });

  it("requires a purpose", () => {
    expect(actions).toContain("MIN_REVEAL_PURPOSE");
    expect(actions).toMatch(/recorded against your name/);
  });

  it("audits BEFORE returning the value", () => {
    const auditAt = actions.indexOf('action: "MEMBER_SENSITIVE_REVEALED"');
    const returnAt = actions.indexOf("mutationOk<RevealedValue>");
    expect(auditAt).toBeGreaterThan(-1);
    expect(auditAt).toBeLessThan(returnAt);
  });

  it("records actor, member, field and purpose", () => {
    expect(actions).toMatch(/metadata: \{ memberId, field, purpose, correlationId \}/);
    expect(actions).toContain("userId: session.user.id");
  });

  it("is tenant-scoped", () => {
    expect(actions).toContain("tenantId");
  });
});

describe("P11.05 the reveal expires on navigation", () => {
  const component = readFileSync("src/components/members/RevealableDetail.tsx", "utf8");

  it("keeps the revealed value in component state only", () => {
    // DEC-10: "The reveal expires on navigation and on session expiry." Nothing
    // persists it, so nothing has to remember to clear it.
    expect(component).not.toContain("localStorage");
    expect(component).not.toContain("sessionStorage");
    expect(component).not.toContain("document.cookie");
  });

  it("says the reveal was recorded, so the operator knows", () => {
    expect(component).toMatch(/shown — recorded/);
  });
});
