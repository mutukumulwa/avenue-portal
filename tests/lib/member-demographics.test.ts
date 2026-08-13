import { describe, expect, it } from "vitest";
import {
  validateMemberDemographicEdits,
  validateMemberDemographics,
} from "@/lib/member-demographics";

describe("member demographic input boundary", () => {
  it("canonicalises names, Uganda phone and email before persistence", () => {
    const result = validateMemberDemographics({
      firstName: "  Jane   Mary ",
      lastName: " Ｄｏｅ ",
      gender: "FEMALE",
      relationship: "PRINCIPAL",
      phone: "0772 555 042",
      email: " JANE@Example.COM ",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        firstName: "Jane Mary",
        lastName: "Doe",
        gender: "FEMALE",
        relationship: "PRINCIPAL",
        phone: "+256772555042",
        email: "jane@example.com",
      },
    });
  });

  it("rejects forged enum values instead of casting them into Prisma", () => {
    const result = validateMemberDemographics({
      firstName: "Jane",
      lastName: "Doe",
      gender: "UNKNOWN",
      relationship: "COUSIN",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.fieldErrors.gender).toBeDefined();
    expect(result.fieldErrors.relationship).toBeDefined();
  });

  it("rejects malformed email and non-Uganda phone values", () => {
    const result = validateMemberDemographics({
      firstName: "Jane",
      lastName: "Doe",
      gender: "FEMALE",
      relationship: "PRINCIPAL",
      phone: "+254700123456",
      email: "not-an-email",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.fieldErrors.phone?.[0]).toMatch(/Ugandan phone/i);
    expect(result.fieldErrors.email?.[0]).toMatch(/valid email/i);
  });

  it("enforces non-empty names and storage-safe name lengths", () => {
    const result = validateMemberDemographics({
      firstName: " ",
      lastName: "x".repeat(101),
      gender: "MALE",
      relationship: "CHILD",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.fieldErrors.firstName).toBeDefined();
    expect(result.fieldErrors.lastName?.[0]).toMatch(/100 characters/i);
  });

  it("validates only supplied edit fields and preserves partial-update semantics", () => {
    const result = validateMemberDemographicEdits({ email: " NEW@Example.com " });
    expect(result).toEqual({ ok: true, value: { email: "new@example.com" } });
  });

  it("rejects a forged partial edit without requiring untouched fields", () => {
    const result = validateMemberDemographicEdits({ relationship: "COUSIN" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.fieldErrors.relationship).toBeDefined();
    expect(result.fieldErrors.firstName).toBeUndefined();
  });
});
