/**
 * Family Hospital UAT plan P04 phase acceptance, as a ratchet:
 *
 *   "new claim, correction, resubmission, new pre-auth, amendment, and
 *    eligibility all use the shared contracts. Repository search finds no
 *    provider form that preloads CPTCode.averageCost, renders it as UGX, or
 *    uses a native diagnosis select."
 *
 * plus the two rules that were broken in every form: one benefit list (FH-12,
 * P03.05) and no UTC-truncated calendar dates (FH-09, plan §7 "Dates").
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const PROVIDER_SOURCES = [...walk("src/app/provider"), ...walk("src/components/provider")];
const read = (p: string) => readFileSync(p, "utf8");
/** Code only: comments may name the old mistakes to explain them. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CAPTURE_FORMS = {
  newClaim: "src/app/provider/claims/new/ProviderClaimForm.tsx",
  correction: "src/app/provider/claims/[id]/correct/CorrectClaimForm.tsx",
  newPreauth: "src/app/provider/preauth/new/ProviderPreauthForm.tsx",
  amendment: "src/app/provider/preauth/[id]/AmendPreauthForm.tsx",
  eligibility: "src/app/provider/eligibility/EligibilityCheckForm.tsx",
} as const;

describe("P04 — no provider surface reads the global CPT/ICD tables into a page", () => {
  it("no provider page or component touches CPTCode or its averageCost", () => {
    const offenders = PROVIDER_SOURCES.filter((f) => /\bcPTCode\b|\baverageCost\b/.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it("no provider page preloads ICD-10 codes or passes an option list to a form", () => {
    const offenders = PROVIDER_SOURCES.filter((f) => /\biCD10Code\.findMany\b|\bicdOptions\b|\bcptOptions\b/.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it("no capture form renders a native <select> or <datalist> of diagnoses", () => {
    for (const file of Object.values(CAPTURE_FORMS)) {
      const src = code(file);
      expect(src, file).not.toMatch(/<datalist/);
      expect(src, file).not.toMatch(/<select[^>]*(diag|icd)/i);
    }
  });
});

describe("P04 — every capture path uses the shared controls", () => {
  it.each(Object.entries(CAPTURE_FORMS).filter(([k]) => k !== "eligibility"))("%s uses the member field, the line editor and the error summary", (_k, file) => {
    const src = read(file);
    expect(src).toMatch(/<ProviderMemberField\b/);
    expect(src).toMatch(/<ServiceLineEditor\b/);
  });

  it.each([CAPTURE_FORMS.newClaim, CAPTURE_FORMS.correction, CAPTURE_FORMS.newPreauth])("%s searches diagnoses with the shared combobox", (file) => {
    expect(read(file)).toMatch(/<DiagnosisCombobox\b/);
  });
});

describe("P03.05 / FH-12 — one benefit list", () => {
  it("no provider file keeps its own benefit array", () => {
    const offenders = PROVIDER_SOURCES.filter((f) => /const BENEFITS\s*[:=]|\[\s*"OUTPATIENT",\s*"(DENTAL|INPATIENT)"/.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it("the eligibility form lists benefits from the canonical module", () => {
    expect(read(CAPTURE_FORMS.eligibility)).toMatch(/PROVIDER_BENEFIT_OPTIONS/);
  });
});

describe("FH-09 / plan §7 — Kampala calendar dates, never UTC-truncated", () => {
  it("no provider page or component derives a calendar date with toISOString()", () => {
    const offenders = PROVIDER_SOURCES.filter((f) => /toISOString\(\)\s*\.\s*(split\(\s*["']T["']\s*\)|slice\(\s*0\s*,\s*10\s*\))/.test(code(f)));
    expect(offenders).toEqual([]);
  });
});

describe("P02.02 / P04.04 — no member reference in a capture URL", () => {
  it("no provider link or redirect carries ?memberId= or a member number", () => {
    const offenders = PROVIDER_SOURCES.filter((f) => /[?&](memberId|memberNumber)=/.test(code(f)));
    expect(offenders).toEqual([]);
  });
});
