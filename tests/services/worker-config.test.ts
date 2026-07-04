/**
 * PR-002 acceptance test 4 — worker boot config validation
 * (missing / malformed / placeholder / present).
 */
import { describe, it, expect } from "vitest";
import { validateWorkerConfig } from "@/server/jobs/worker-config";

const GOOD = {
  DATABASE_URL: "postgresql://mdx:secret@db.internal:5432/aicare_uat",
  REDIS_URL: "redis://cache.internal:6379",
};

describe("validateWorkerConfig (PR-002)", () => {
  it("passes with a complete, real-looking config", () => {
    expect(validateWorkerConfig(GOOD)).toEqual({ ok: true, errors: [] });
  });

  it("fails when DATABASE_URL is missing — names the variable", () => {
    const r = validateWorkerConfig({ ...GOOD, DATABASE_URL: undefined });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/DATABASE_URL/);
  });

  it("fails when REDIS_URL is missing — never falls back to localhost", () => {
    const r = validateWorkerConfig({ ...GOOD, REDIS_URL: "" });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/REDIS_URL/);
  });

  it("fails on malformed URLs", () => {
    expect(validateWorkerConfig({ ...GOOD, DATABASE_URL: "mysql://nope" }).ok).toBe(false);
    expect(validateWorkerConfig({ ...GOOD, REDIS_URL: "http://nope" }).ok).toBe(false);
  });

  it("fails on placeholder values", () => {
    const r = validateWorkerConfig({ ...GOOD, DATABASE_URL: "postgresql://user:password@CHANGE_ME:5432/db" });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/placeholder/);
  });

  it("reports every problem at once (missing both)", () => {
    const r = validateWorkerConfig({});
    expect(r.errors).toHaveLength(2);
  });
});
