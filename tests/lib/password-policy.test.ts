import { describe, it, expect } from "vitest";
import { validatePassword } from "@/lib/password-policy";

describe("validatePassword (R28 / V-08)", () => {
  it("accepts a compliant password", () => {
    expect(validatePassword("Medvex2026x")).toBeNull();
  });
  it("rejects too-short passwords", () => {
    expect(validatePassword("Ab1cdef")).toMatch(/at least/);
  });
  it("requires a lowercase letter", () => {
    expect(validatePassword("PASSWORD123")).toMatch(/lowercase/);
  });
  it("requires an uppercase letter", () => {
    expect(validatePassword("password123")).toMatch(/uppercase/);
  });
  it("requires a digit", () => {
    expect(validatePassword("PasswordOnly")).toMatch(/digit/);
  });
  it("rejects empty", () => {
    expect(validatePassword("")).toMatch(/required/);
  });
});
