/**
 * §4.1 / A-008 — the session must carry a 30-minute rolling idle timeout
 * (decision D-19). This pins the objective oracle values and confirms auth.ts
 * actually feeds them into the NextAuth `session` config (rather than the
 * next-auth default of 30 days).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SESSION_IDLE_MAX_AGE_S, SESSION_UPDATE_AGE_S } from "@/lib/session-policy";

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
