import { describe, expect, it } from "vitest";
import {
  memberAddressLines,
  validateMemberAddress,
} from "@/lib/member-address";

describe("P05.06 structured Uganda member address", () => {
  it("preserves the controlled Uganda hierarchy and long place names", () => {
    const result = validateMemberAddress({
      addressCountry: "Uganda",
      addressDistrict: "  Wakiso  ",
      addressLocality: "Kira Municipality",
      addressSubcounty: "Namugongo Division",
      addressParish: "Kyaliwajjala Parish With A Deliberately Long But Valid Name",
      addressVillage: "Buwate Zone",
      addressLine: "Plot 18, The Landmark Opposite the Community Health Centre",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.addressDistrict).toBe("Wakiso");
    expect(memberAddressLines(result.value)).toEqual([
      "Plot 18, The Landmark Opposite the Community Health Centre",
      "Buwate Zone, Kyaliwajjala Parish With A Deliberately Long But Valid Name, Namugongo Division, Kira Municipality, Wakiso, Uganda",
    ]);
  });

  it("allows a wholly optional blank address without inventing locality data", () => {
    const result = validateMemberAddress({});
    expect(result).toMatchObject({
      ok: true,
      value: {
        addressCountry: "Uganda",
        addressDistrict: null,
        addressLatitude: null,
        hasCoordinateConsent: false,
      },
    });
  });

  it("requires a district once any lower address level is supplied", () => {
    expect(validateMemberAddress({ addressVillage: "Buwate" })).toMatchObject({
      ok: false,
      fieldErrors: { addressDistrict: [expect.stringMatching(/district/i)] },
    });
  });

  it("stores coordinates only as a pair with explicit consent", () => {
    expect(
      validateMemberAddress({
        addressDistrict: "Wakiso",
        addressLatitude: "0.347596",
        addressLongitude: "32.582520",
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { addressCoordinateConsent: [expect.stringMatching(/consent/i)] },
    });

    const accepted = validateMemberAddress({
      addressDistrict: "Wakiso",
      addressLatitude: "0.347596",
      addressLongitude: "32.582520",
      addressCoordinateConsent: "on",
    });
    expect(accepted).toMatchObject({
      ok: true,
      value: {
        addressLatitude: "0.347596",
        addressLongitude: "32.582520",
        hasCoordinateConsent: true,
      },
    });
  });

  it("rejects a lone, out-of-range or silently rounded coordinate", () => {
    expect(
      validateMemberAddress({
        addressDistrict: "Wakiso",
        addressLatitude: "0.3",
        addressCoordinateConsent: "on",
      }),
    ).toMatchObject({ ok: false, fieldErrors: { addressLongitude: expect.any(Array) } });
    expect(
      validateMemberAddress({
        addressDistrict: "Wakiso",
        addressLatitude: "91",
        addressLongitude: "32",
        addressCoordinateConsent: "on",
      }),
    ).toMatchObject({ ok: false, fieldErrors: { addressLatitude: expect.any(Array) } });
    expect(
      validateMemberAddress({
        addressDistrict: "Wakiso",
        addressLatitude: "0.1234567",
        addressLongitude: "32.5",
        addressCoordinateConsent: "on",
      }),
    ).toMatchObject({ ok: false, fieldErrors: { addressLatitude: [expect.stringMatching(/6 decimal/i)] } });
  });

  it("rejects a forged foreign country rather than relabelling it Uganda", () => {
    expect(validateMemberAddress({ addressCountry: "Kenya", addressDistrict: "Nairobi" })).toMatchObject({
      ok: false,
      fieldErrors: { addressCountry: expect.any(Array) },
    });
  });
});
