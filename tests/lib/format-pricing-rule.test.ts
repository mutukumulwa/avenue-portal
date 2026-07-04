/**
 * PR-008 acceptance — every rule kind renders in operator language with no
 * raw JSON braces.
 */
import { describe, it, expect } from "vitest";
import { formatPricingRule } from "@/lib/format-pricing-rule";

describe("formatPricingRule (PR-008)", () => {
  const cases: Array<[string, unknown, RegExp]> = [
    ["PER_VISIT_CASE_RATE", { rate: 3600, carveOutDescriptions: ["MRI", "CT scans"] }, /Per-visit case rate — KES 3,600.*carve-outs: MRI, CT scans/],
    ["DISCOUNT_OFF_BILLED", { pct: 15 }, /Discount — 15% off billed/],
    ["CAPITATION", { poolId: "P-x" }, /Capitation — prepaid via pool P-x.*price at 0/],
    ["PER_DIEM", { rate: 12000 }, /Per-diem — KES 12,000 per day/],
    ["PACKAGE", { rate: 250000 }, /Package price — KES 250,000 fixed/],
    ["AVERAGE_COST_POOL", { poolId: "AVG-1" }, /Average-cost pool AVG-1/],
    ["NET_OF_EXTERNAL", { scheme: "SHA" }, /Net of SHA/],
    ["FIXED", { rate: 500 }, /Fixed rate — KES 500/],
  ];

  it.each(cases)("%s renders formatted", (ruleKind, params, expected) => {
    const text = formatPricingRule({ ruleKind, params });
    expect(text).toMatch(expected);
    expect(text).not.toMatch(/[{}]/); // no raw JSON in rendered rule text
  });

  it("unknown kinds degrade to a readable label, never JSON", () => {
    const text = formatPricingRule({ ruleKind: "LOWER_OF", params: { a: 1 } });
    expect(text).not.toMatch(/[{}]/);
  });
});
