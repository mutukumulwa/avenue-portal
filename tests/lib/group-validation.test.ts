import { describe, it, expect } from "vitest";
import {
  groupCreateSchema,
  groupEditSchema,
  tierSchema,
  groupStatusChangeSchema,
} from "@/lib/validation/group";

const baseCreate = {
  name: "Lakeview Staff Medical Scheme",
  contactPersonName: "Jane Doe",
  contactPersonPhone: "+256700000000",
  contactPersonEmail: "jane@example.co",
  packageId: "pkg1",
  effectiveDate: "2026-08-01",
};

const baseEdit = {
  name: "Lakeview Staff Medical Scheme",
  contactPersonName: "Jane Doe",
  contactPersonPhone: "+256700000000",
  contactPersonEmail: "jane@example.co",
  paymentFrequency: "ANNUAL",
  effectiveDate: "2026-08-01",
  renewalDate: "2027-08-01",
};

describe("groupCreateSchema — WP-S1", () => {
  it("trims + collapses the name and coerces the date", () => {
    const r = groupCreateSchema.parse({ ...baseCreate, name: "  Lakeview   Staff Medical Scheme " });
    expect(r.name).toBe("Lakeview Staff Medical Scheme");
    expect(r.effectiveDate).toBeInstanceOf(Date);
  });

  it("rejects a blank name", () => {
    expect(groupCreateSchema.safeParse({ ...baseCreate, name: "   " }).success).toBe(false);
  });

  it("rejects an invalid / out-of-horizon effective date", () => {
    expect(groupCreateSchema.safeParse({ ...baseCreate, effectiveDate: "not-a-date" }).success).toBe(false);
    expect(groupCreateSchema.safeParse({ ...baseCreate, effectiveDate: "1990-01-01" }).success).toBe(false);
    expect(groupCreateSchema.safeParse({ ...baseCreate, effectiveDate: "2099-01-01" }).success).toBe(false);
  });

  it("accepts a leap-day effective date", () => {
    expect(groupCreateSchema.safeParse({ ...baseCreate, effectiveDate: "2028-02-29" }).success).toBe(true);
  });

  it("allows an absent registration number but rejects unsafe formats", () => {
    expect(groupCreateSchema.safeParse({ ...baseCreate, registrationNumber: "" }).success).toBe(true);
    expect(groupCreateSchema.safeParse({ ...baseCreate, registrationNumber: "CPR/2023/12345" }).success).toBe(true);
    expect(groupCreateSchema.safeParse({ ...baseCreate, registrationNumber: "=SUM(1)" }).success).toBe(false);
    expect(groupCreateSchema.safeParse({ ...baseCreate, registrationNumber: "💊" }).success).toBe(false);
  });

  it("rejects a malformed contact email", () => {
    expect(groupCreateSchema.safeParse({ ...baseCreate, contactPersonEmail: "not-an-email" }).success).toBe(false);
  });
});

describe("groupEditSchema — WP-S1 cross-field", () => {
  it("accepts a valid effective < renewal pair", () => {
    expect(groupEditSchema.safeParse(baseEdit).success).toBe(true);
  });

  it("rejects renewal-before-start with the error on renewalDate (S-006)", () => {
    const r = groupEditSchema.safeParse({ ...baseEdit, effectiveDate: "2027-08-01", renewalDate: "2026-08-01" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.renewalDate?.length).toBeGreaterThan(0);
    }
  });

  it("rejects an invalid paymentFrequency", () => {
    expect(groupEditSchema.safeParse({ ...baseEdit, paymentFrequency: "WEEKLY" }).success).toBe(false);
  });
});

describe("tierSchema — WP-S3", () => {
  it("rejects a NaN / negative contribution rate", () => {
    expect(tierSchema.safeParse({ name: "Exec", packageId: "p", contributionRate: "abc", isDefault: false }).success).toBe(false);
    expect(tierSchema.safeParse({ name: "Exec", packageId: "p", contributionRate: "-5", isDefault: false }).success).toBe(false);
  });

  it("accepts a clean rate and coerces isDefault", () => {
    const r = tierSchema.parse({ name: "Exec", packageId: "p", contributionRate: "75000", isDefault: true });
    expect(r.contributionRate).toBe(75000);
    expect(r.isDefault).toBe(true);
    expect(r.description).toBeNull();
  });
});

describe("groupStatusChangeSchema — WP-S2", () => {
  it("rejects an unknown target status", () => {
    expect(groupStatusChangeSchema.safeParse({ targetStatus: "BOGUS" }).success).toBe(false);
  });

  it("accepts a known target with an optional reason + override", () => {
    const r = groupStatusChangeSchema.parse({ targetStatus: "SUSPENDED", reason: "overdue", override: true });
    expect(r.targetStatus).toBe("SUSPENDED");
    expect(r.reason).toBe("overdue");
    expect(r.override).toBe(true);
  });
});
