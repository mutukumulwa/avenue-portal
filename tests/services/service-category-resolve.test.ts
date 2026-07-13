import { describe, it, expect } from "vitest";
import { ServiceCategoryService, CATEGORIES } from "@/server/services/service-category.service";

const resolve = (providerServiceCode: string | null, serviceName: string) =>
  ServiceCategoryService.categoryCodeForTariff({ providerServiceCode, cptCode: providerServiceCode, serviceName });

// Representative rows from the St. Francis Naggalama master (the provider HMS
// code scheme shared across the 200+ contracts in the book).
describe("categoryCodeForTariff — provider-code prefix scheme", () => {
  it.each([
    ["LAB238", "24HR URINE PROTEIN", "LABORATORY"],
    ["NLAB01", "Albumin", "LABORATORY"],
    ["RD031", "Abdomen Contrast", "RADIOLOGY"],
    ["XRS04", "Abdomen (Ap & Lat-Dec)", "XRAY"],
    ["USS01", "Abdominal Ultra Sound", "ULTRASOUND"],
    ["CTS03", "CT Brain With Contrast", "CT_SCAN"],
    ["MRI07", "Mra/Mrv", "MRI"],
    ["PH019", "Acyclovir 400mg tablets", "PHARMACY"],
    ["PH-DISP01", "Pharmacy Dispensing Fee", "PHARMACY"],
    ["CONS-GP01", "General Practitioner Consultation", "CONSULTATION"],
    ["CONS-ONC01", "Oncology Consultation", "SPECIALIST_CONSULTATION"],
    ["CONS-ER01", "Emergency Department Attendance", "CASUALTY"],
    ["WARD-GEN01", "General Ward Bed / Day", "IP_SERVICES"],
    ["WARD-ICU01", "ICU Bed / Day", "ICU"],
    ["WARD-HDU01", "HDU Bed / Day", "ICU"],
    ["GP-REV01", "Daily Inpatient Review", "IP_REVIEW"],
    ["GP-NVD01", "Normal Vaginal Delivery", "MATERNITY"],
    ["GP-CS01", "Caesarean Section", "MATERNITY"],
    ["GP-NURS01", "Daily Nursing Care", "IP_SERVICES"],
    ["DENT-XT01", "Tooth Extraction", "DENTAL"],
  ])("%s (%s) → %s", (code, name, expected) => {
    expect(resolve(code, name)).toBe(expected);
  });
});

// SER*/SERV* are the mixed "Services & Procedures" master — prefix alone is
// ambiguous, so the name decides, falling back to a generic PROCEDURE.
describe("categoryCodeForTariff — mixed SER/SERV codes resolve by name", () => {
  it.each([
    ["SER208", "ACL Reconstruction", "GENERAL_SURGERY"],
    ["SERV01", "Appendicectomy", "GENERAL_SURGERY"],
    ["SER045", "Ambulance (per trip, within 50km)", "AMBULANCE"],
    ["SER090", "Female Catheterisation", "MINOR_PROCEDURE"],
    ["SER777", "Some bespoke bundled service", "PROCEDURE"],
  ])("%s (%s) → %s", (code, name, expected) => {
    expect(resolve(code, name)).toBe(expected);
  });
});

// Code-less lines (e.g. OCR-extracted contracts) fall back to name keywords.
describe("categoryCodeForTariff — code-less lines use name keywords", () => {
  it.each([
    ["Outpatient Consultation Fees", "CONSULTATION"],
    ["Haemodialysis Session", "DIALYSIS"],
    ["Physiotherapy Session", "PHYSIOTHERAPY"],
    ["Full Haemogram", "LABORATORY"],
  ])("(%s) → %s", (name, expected) => {
    expect(ServiceCategoryService.categoryCodeForTariff({ serviceName: name })).toBe(expected);
  });

  it("returns null when nothing is confident", () => {
    expect(ServiceCategoryService.categoryCodeForTariff({ serviceName: "Miscellaneous line item", cptCode: "ZZZ9" })).toBeNull();
  });
});

// Guardrail: every category the resolver can emit must exist in the taxonomy,
// or the FK lookup would silently leave lines unmapped.
describe("resolver targets are real categories", () => {
  it("every emittable code is present in CATEGORIES", () => {
    const known = new Set(CATEGORIES.map((c) => c.code));
    const samples = [
      "LAB238", "NLAB01", "RD031", "XRS04", "USS01", "CTS03", "MRI07", "PH019", "PH-DISP01",
      "CONS-GP01", "CONS-ONC01", "CONS-ER01", "WARD-GEN01", "WARD-ICU01", "GP-REV01",
      "GP-NVD01", "GP-CS01", "GP-NURS01", "DENT-XT01", "SER208", "SERV01", "SER045", "SER090", "SER777",
    ];
    for (const code of samples) {
      const cat = resolve(code, "probe reconstruction ambulance catheter");
      if (cat) expect(known.has(cat)).toBe(true);
    }
  });
});
