import { describe, expect, it, vi } from "vitest";
import { buildKnowledgePrompts, verifyKnowledgeAnswers } from "@/server/services/secure-checkin/knowledge";

describe("secure check-in knowledge prompts", () => {
  it("uses approved bank-style identity questions without returning answers", () => {
    vi.setSystemTime(new Date("2026-04-28T00:00:00.000Z"));

    const prompts = buildKnowledgePrompts({
      firstName: "Amina",
      lastName: "Otieno",
      dateOfBirth: new Date("1996-04-28T00:00:00.000Z"),
      phone: "+254700123456",
      email: "amina@example.com",
      group: { name: "Avenue Staff" },
      dependents: [{ firstName: "Nia", lastName: "Otieno" }],
    });

    expect(prompts).toHaveLength(3);
    expect(prompts.map((p) => p.key)).toEqual(["full_name", "age", "group_name"]);
    expect(JSON.stringify(prompts)).not.toContain("Amina Otieno");
    expect(JSON.stringify(prompts)).not.toContain("30");
    expect(JSON.stringify(prompts)).not.toContain("Avenue Staff");

    vi.useRealTimers();
  });

  it("verifies all three generated answers", () => {
    vi.setSystemTime(new Date("2026-04-28T00:00:00.000Z"));

    const member = {
      firstName: "Amina",
      lastName: "Otieno",
      dateOfBirth: new Date("1996-04-28T00:00:00.000Z"),
      group: { name: "Avenue Staff" },
      dependents: [],
    };

    expect(
      verifyKnowledgeAnswers(member, [
        { key: "full_name", answer: "Amina Otieno" },
        { key: "age", answer: "30" },
        { key: "group_name", answer: "avenue staff" },
      ]).passed
    ).toBe(true);

    expect(
      verifyKnowledgeAnswers(member, [
        { key: "full_name", answer: "Amina Otieno" },
        { key: "age", answer: "29" },
        { key: "group_name", answer: "avenue staff" },
      ]).passed
    ).toBe(false);

    vi.useRealTimers();
  });
});
