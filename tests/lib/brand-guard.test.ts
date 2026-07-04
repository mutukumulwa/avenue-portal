/**
 * PR-003/PR-004 acceptance: the brand/secret guard fails on fixtures containing
 * the leaked credentials block or rendered legacy branding, and passes clean
 * content. Tests the shared rules module the prebuild script consumes.
 */
import { describe, it, expect } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain-ESM module without type declarations
import { scanText, SEEDED_ACCOUNT_EMAILS } from "../../scripts/lib/guard-rules.mjs";

const burnedPassword = ["Medvex", "Admin", "2024", "!"].join("");

describe("brand/secret guard rules (PR-003, PR-004)", () => {
  it("fails on the old login-page credentials block", () => {
    const fixture = [
      "Admin: admin@medvex.co.ug · HR: emily.wambui@safaricom.co.ke",
      `Password: <span className="font-mono">${burnedPassword}</span>`,
    ].join("\n");
    const findings = scanText(fixture, "src/app/(auth)/login/page.tsx");
    const rules = findings.map((f: { rule: string }) => f.rule);
    expect(rules).toContain("burned-seed-password");
    expect(rules).toContain("seeded-account-email-in-ui");
  });

  it("fails on the burned password anywhere in src, even outside src/app", () => {
    const findings = scanText(`const pw = "${burnedPassword}"`, "src/server/services/foo.ts");
    expect(findings.map((f: { rule: string }) => f.rule)).toContain("burned-seed-password");
  });

  it("allows seeded emails in seed code (prisma/) — only UI rendering is blocked", () => {
    const findings = scanText("email: 'admin@medvex.co.ug',", "prisma/seed.ts");
    expect(findings.filter((f: { rule: string }) => f.rule === "seeded-account-email-in-ui")).toHaveLength(0);
  });

  it("fails on rendered AiCare branding", () => {
    const findings = scanText("<h1>AiCare Platform</h1>", "src/app/(auth)/login/page.tsx");
    expect(findings.map((f: { rule: string }) => f.rule)).toContain("legacy-brand-aicare-rendered");
  });

  it("allows lowercase aicare infra identifiers and ALL-CAPS doc refs", () => {
    const fixture = [
      'const DEFAULT_BUCKET = "aicare-documents";',
      'const sig = request.headers.get("x-aicare-signature");',
      "// resolves AICARE_TODO V-02",
    ].join("\n");
    expect(scanText(fixture, "src/lib/minio.ts")).toHaveLength(0);
  });

  it("fails on the legacy avenue brand, case-insensitively", () => {
    const findings = scanText("welcome to AVENUE healthcare", "src/app/page.tsx");
    expect(findings.map((f: { rule: string }) => f.rule)).toContain("legacy-brand-avenue");
  });

  it("passes clean content", () => {
    expect(scanText("Welcome back to the Medvex platform.", "src/app/(admin)/dashboard/page.tsx")).toHaveLength(0);
  });

  it("covers every seeded login account in the email rule", () => {
    for (const email of SEEDED_ACCOUNT_EMAILS) {
      const findings = scanText(`contact: "${email}"`, "src/app/member/support/page.tsx");
      expect(findings.map((f: { rule: string }) => f.rule)).toContain("seeded-account-email-in-ui");
    }
  });
});
