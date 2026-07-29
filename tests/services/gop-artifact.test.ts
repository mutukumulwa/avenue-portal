/**
 * F3.14 — GOP artifact data mapper.
 *
 * buildGopData produces the printable Guarantee-of-Payment fields ONLY for an
 * APPROVED PA that carries an issued gopNumber; otherwise null (so the download
 * affordance never appears on a submitted/declined/cancelled PA).
 */
import { describe, it, expect } from "vitest";
import { buildGopData } from "@/app/provider/preauth/[id]/gop-artifact";

const approved = {
  status: "APPROVED",
  gopNumber: "GOP-2026-00007",
  preauthNumber: "PA-2026-00042",
  approvedAmount: 48000,
  validFrom: new Date("2026-08-01T00:00:00Z"),
  validUntil: new Date("2026-08-31T00:00:00Z"),
  gopIssuedAt: new Date("2026-08-01T00:00:00Z"),
  serviceType: "OUTPATIENT",
  benefitCategory: "CHRONIC_DISEASE",
  member: { firstName: "Amina", lastName: "Otieno", memberNumber: "NWSC-2026-01234" },
  provider: { name: "Nairobi West Hospital" },
};

describe("F3.14 buildGopData", () => {
  it("maps an APPROVED PA with a gopNumber to printable GOP fields", () => {
    const gop = buildGopData(approved);
    expect(gop).not.toBeNull();
    expect(gop).toMatchObject({
      gopNumber: "GOP-2026-00007",
      preauthNumber: "PA-2026-00042",
      memberName: "Amina Otieno",
      memberNumber: "NWSC-2026-01234",
      providerName: "Nairobi West Hospital",
      benefit: "CHRONIC DISEASE", // underscores humanized
      serviceType: "OUTPATIENT",
      approvedAmount: 48000,
    });
    expect(gop!.validFrom).toMatch(/2026/);
    expect(gop!.issuedAt).toMatch(/2026/);
  });

  it("returns null when the PA is not APPROVED (no GOP exists yet)", () => {
    expect(buildGopData({ ...approved, status: "SUBMITTED" })).toBeNull();
    expect(buildGopData({ ...approved, status: "DECLINED" })).toBeNull();
    expect(buildGopData({ ...approved, status: "CANCELLED" })).toBeNull();
  });

  it("returns null when APPROVED but no gopNumber was issued", () => {
    expect(buildGopData({ ...approved, gopNumber: null })).toBeNull();
  });

  it("tolerates a null approved amount (falls back to 0) and null dates (— placeholder)", () => {
    const gop = buildGopData({ ...approved, approvedAmount: null, validUntil: null });
    expect(gop!.approvedAmount).toBe(0);
    expect(gop!.validUntil).toBe("—");
  });
});
