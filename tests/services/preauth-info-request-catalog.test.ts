/**
 * F4.1 — clinical information-request catalog (pure).
 */
import { describe, it, expect } from "vitest";
import {
  INFO_REQUEST_ITEMS,
  isValidInfoRequestItem,
  normalizeRequestedItems,
  infoRequestItemLabel,
} from "@/server/services/preauth-info-request/catalog";

describe("F4.1 info-request catalog", () => {
  it("exposes a non-empty catalog with unique codes and copy", () => {
    expect(INFO_REQUEST_ITEMS.length).toBeGreaterThan(0);
    const codes = INFO_REQUEST_ITEMS.map((i) => i.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const item of INFO_REQUEST_ITEMS) {
      expect(item.code).toMatch(/^[A-Z_]+$/);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
    }
  });

  it("validates known vs unknown codes", () => {
    expect(isValidInfoRequestItem("LAB_RESULTS")).toBe(true);
    expect(isValidInfoRequestItem("NONSENSE")).toBe(false);
  });

  it("normalizes: upcases/trims, drops unknown, de-dupes, preserves first-seen order", () => {
    expect(normalizeRequestedItems([" lab_results ", "CLINICAL_NOTES", "lab_results", "bogus"])).toEqual(["LAB_RESULTS", "CLINICAL_NOTES"]);
  });

  it("returns [] for junk / non-arrays / all-unknown", () => {
    expect(normalizeRequestedItems(null)).toEqual([]);
    expect(normalizeRequestedItems("LAB_RESULTS")).toEqual([]);
    expect(normalizeRequestedItems([1, {}, "unknown"])).toEqual([]);
  });

  it("labels known codes, falls back to the raw code for unknown", () => {
    expect(infoRequestItemLabel("LAB_RESULTS")).toBe("Laboratory results");
    expect(infoRequestItemLabel("XYZ")).toBe("XYZ");
  });
});
