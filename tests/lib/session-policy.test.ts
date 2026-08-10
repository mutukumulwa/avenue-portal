/**
 * §4.1 / A-008 — the session must carry a 30-minute rolling idle timeout
 * (decision D-19). This pins the objective oracle values and confirms auth.ts
 * actually feeds them into the NextAuth `session` config (rather than the
 * next-auth default of 30 days).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SESSION_IDLE_MAX_AGE_S,
  SESSION_UPDATE_AGE_S,
  SESSION_EXPIRED_REASON,
  sessionIsExpired,
  expiredLoginPath,
} from "@/lib/session-policy";

describe("session idle-timeout policy (D-19)", () => {
  it("uses a 30-minute idle max age, rolled every 5 minutes", () => {
    expect(SESSION_IDLE_MAX_AGE_S).toBe(1800);
    expect(SESSION_UPDATE_AGE_S).toBe(300);
  });

  it("auth.ts wires the policy into the NextAuth session config", () => {
    const src = readFileSync(resolve(__dirname, "../../src/lib/auth.ts"), "utf8");
    expect(src).toContain('from "@/lib/session-policy"');
    expect(src).toMatch(/maxAge:\s*SESSION_IDLE_MAX_AGE_S/);
    expect(src).toMatch(/updateAge:\s*SESSION_UPDATE_AGE_S/);
  });
});

describe("DEF-010 — idle-expiry-at-point-of-action helpers", () => {
  it("exposes a stable expired reason string", () => {
    expect(SESSION_EXPIRED_REASON).toBe("expired");
  });

  it("sessionIsExpired: expired only when now is at/after a finite expiry", () => {
    const now = 1_000_000;
    expect(sessionIsExpired(now - 1, now)).toBe(true); // already past
    expect(sessionIsExpired(now, now)).toBe(true); // exactly at expiry
    expect(sessionIsExpired(now + 1, now)).toBe(false); // still valid
  });

  it("sessionIsExpired: an unknown/unparseable expiry is treated as NOT expired (guard stays inert, server stays authority)", () => {
    const now = 1_000_000;
    expect(sessionIsExpired(null, now)).toBe(false);
    expect(sessionIsExpired(undefined, now)).toBe(false);
    expect(sessionIsExpired(NaN, now)).toBe(false);
  });

  it("expiredLoginPath: always carries the reason, and preserves a safe in-app callbackUrl", () => {
    expect(expiredLoginPath()).toBe("/login?reason=expired");
    expect(expiredLoginPath("/members/new")).toBe(
      "/login?reason=expired&callbackUrl=%2Fmembers%2Fnew",
    );
  });

  it("expiredLoginPath: refuses open-redirect / loopback targets", () => {
    expect(expiredLoginPath("https://evil.example/x")).toBe("/login?reason=expired");
    expect(expiredLoginPath("//evil.example")).toBe("/login?reason=expired");
    expect(expiredLoginPath("/login")).toBe("/login?reason=expired");
  });
});
