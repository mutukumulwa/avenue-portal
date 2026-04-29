import { describe, expect, it } from "vitest";
import { addSeconds, generateVisitCode, hashesMatch, randomBase64Url, sha256 } from "@/server/services/secure-checkin/crypto";

describe("secure check-in crypto helpers", () => {
  it("generates 6-digit visit codes", () => {
    expect(generateVisitCode()).toMatch(/^\d{6}$/);
  });

  it("hashes and compares values without returning the raw value", () => {
    const hash = sha256("123456");

    expect(hash).not.toBe("123456");
    expect(hashesMatch("123456", hash)).toBe(true);
    expect(hashesMatch("654321", hash)).toBe(false);
  });

  it("generates URL-safe random challenges", () => {
    expect(randomBase64Url()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("adds seconds to dates", () => {
    const start = new Date("2026-04-28T10:00:00.000Z");
    expect(addSeconds(start, 90).toISOString()).toBe("2026-04-28T10:01:30.000Z");
  });
});
