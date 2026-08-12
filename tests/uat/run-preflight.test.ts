/**
 * UAT-HF P00.05 — the run preflight must refuse to start a run that cannot be
 * signed off (DEF-001), and must refuse a run whose scenarios need harness
 * capabilities it does not have.
 *
 * The acceptance criterion is specifically that a *deliberately missing* owner or
 * oracle prevents run start *with a precise message* — so these tests assert on
 * the message content, not merely on `ok === false`.
 */
import { describe, it, expect } from "vitest";
import {
  validateRunManifest,
  formatPreflightResult,
  isPlaceholder,
  OWNER_ROLES,
  HARNESS_CAPABILITIES,
  type RunManifest,
} from "../../scripts/uat/run-preflight";

/** A manifest that passes, so each test can remove exactly one thing. */
function validManifest(): RunManifest {
  return {
    runId: "UAT-HF-20260901-01",
    buildSha: "c590c6d",
    target: "https://avenue-portal.vercel.app",
    timezone: "Africa/Nairobi",
    owners: {
      business: "Amina Nakato",
      security: "Joseph Okello",
      operations: "Grace Achieng",
      accessibility: "Daniel Mugisha",
      networkFault: "Grace Achieng",
      dataReset: "Peter Ssemwogerere",
      privacy: "Joseph Okello",
    },
    oracles: [
      {
        id: "ORACLE-01",
        description: "Approved benefit limits per package version",
        source: "Signed controlled-source pack CT-010..CT-022 (SHA256SUMS verified)",
      },
    ],
    actors: [{ persona: "UL — UAT Lead", role: "SUPER_ADMIN", provisioned: true }],
    fixtures: [{ id: "TD-002", description: "Controlled scheme created by C-010", present: true }],
    flags: { SCHEMA_DEPLOY_MODE: "push" },
    harnessCapabilities: {
      mailSink: true,
      downloadInterception: true,
      coldOfflineNavigation: true,
      exhaustedBenefitFixture: true,
    },
    scenarios: [{ id: "A-005", requiresCapabilities: ["mailSink"] }],
  };
}

describe("P00.05 UAT run preflight", () => {
  it("passes a fully specified manifest", () => {
    const result = validateRunManifest(validManifest());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // ── DEF-001: the gap that left UAT-HF-20260811-01 permanently unsigned ──────
  it.each(OWNER_ROLES)("fails with a precise message when the %s owner is missing", (role) => {
    const m = validManifest();
    delete m.owners[role];

    const result = validateRunManifest(m);
    expect(result.ok).toBe(false);
    const message = result.errors.find((e) => e.startsWith(`owners.${role}:`));
    expect(message).toBeDefined();
    expect(message).toContain("not supplied");
    expect(message).toContain("DEF-001");
  });

  it("rejects a placeholder owner name rather than accepting it as a signature", () => {
    for (const placeholder of ["TBD", "  tbd  ", "N/A", "—", "<name>", "???", "TODO", ""]) {
      const m = validManifest();
      m.owners.business = placeholder;
      const result = validateRunManifest(m);
      expect(result.ok, `expected "${placeholder}" to be rejected`).toBe(false);
      expect(result.errors.some((e) => e.startsWith("owners.business:"))).toBe(true);
    }
  });

  it("reports every missing owner at once, not just the first", () => {
    const m = validManifest();
    m.owners = {};
    const result = validateRunManifest(m);
    for (const role of OWNER_ROLES) {
      expect(result.errors.some((e) => e.startsWith(`owners.${role}:`))).toBe(true);
    }
  });

  // ── oracles ────────────────────────────────────────────────────────────────
  it("fails when no oracle is declared", () => {
    const m = validManifest();
    m.oracles = [];
    const result = validateRunManifest(m);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith("oracles:") && e.includes("independent"))).toBe(true);
  });

  it("fails when an oracle has no independent source", () => {
    const m = validManifest();
    m.oracles[0].source = "";
    const result = validateRunManifest(m);
    expect(result.ok).toBe(false);
    const message = result.errors.find((e) => e.startsWith("oracles[0].source:"));
    expect(message).toContain("independent");
  });

  // ── harness capabilities: the 7 steps no product fix could unblock ──────────
  it("fails when a scenario needs a capability the harness does not have", () => {
    const m = validManifest();
    m.harnessCapabilities.mailSink = false; // A-005 s4's actual blocker
    const result = validateRunManifest(m);
    expect(result.ok).toBe(false);
    const message = result.errors.find((e) => e.includes("A-005"));
    expect(message).toContain("mailSink");
    expect(message).toContain("not available");
  });

  it.each(HARNESS_CAPABILITIES)("fails when the %s capability is not declared at all", (cap) => {
    const m = validManifest();
    delete m.harnessCapabilities[cap];
    const result = validateRunManifest(m);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith(`harnessCapabilities.${cap}:`))).toBe(true);
  });

  it("rejects a scenario requiring an unknown capability", () => {
    const m = validManifest();
    m.scenarios = [{ id: "X-999", requiresCapabilities: ["timeTravel" as never] }];
    const result = validateRunManifest(m);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("unknown capability"))).toBe(true);
  });

  // ── run identity, actors, fixtures ─────────────────────────────────────────
  it("rejects a build SHA that is not a git SHA", () => {
    const m = validManifest();
    m.buildSha = "latest";
    const result = validateRunManifest(m);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith("buildSha:") && e.includes("not a git SHA"))).toBe(true);
  });

  it("rejects an invalid timezone", () => {
    const m = validManifest();
    m.timezone = "Africa/Nairobbi";
    const result = validateRunManifest(m);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith("timezone:"))).toBe(true);
  });

  it("fails when an actor is not provisioned", () => {
    const m = validManifest();
    m.actors[0].provisioned = false;
    const result = validateRunManifest(m);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("UL — UAT Lead") && e.includes("not provisioned"))).toBe(true);
  });

  it("fails when a declared fixture is not present (the ordering trap)", () => {
    const m = validManifest();
    m.fixtures[0].present = false;
    const result = validateRunManifest(m);
    expect(result.ok).toBe(false);
    const message = result.errors.find((e) => e.includes("TD-002"));
    expect(message).toContain("Blocked on ordering");
  });

  it("fails when the flag state is not recorded", () => {
    const m = validManifest();
    delete (m as Partial<RunManifest>).flags;
    const result = validateRunManifest(m);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith("flags:"))).toBe(true);
  });

  it("rejects a non-object manifest outright", () => {
    for (const bad of [null, "a string", 42, undefined]) {
      expect(validateRunManifest(bad).ok).toBe(false);
    }
  });

  // ── the shipped template must itself be unusable until filled in ───────────
  it("rejects the blank template, so a copied-but-unfilled manifest cannot start a run", async () => {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile("uat/templates/run-manifest.template.json", "utf8");
    const result = validateRunManifest(JSON.parse(raw));
    expect(result.ok).toBe(false);
    // Every owner is an angle-bracket placeholder in the template.
    for (const role of OWNER_ROLES) {
      expect(result.errors.some((e) => e.startsWith(`owners.${role}:`))).toBe(true);
    }
  });

  // ── operator-facing output ─────────────────────────────────────────────────
  it("formats a failure so the operator is told not to start", () => {
    const out = formatPreflightResult("UAT-X", { ok: false, errors: ["owners.business: not supplied."] });
    expect(out).toContain("FAILED");
    expect(out).toContain("must NOT start");
    expect(out).toContain("owners.business");
  });

  it("formats a pass as explicit permission to start", () => {
    expect(formatPreflightResult("UAT-X", { ok: true, errors: [] })).toContain("may start");
  });

  it("treats blanks and decorative dashes as placeholders but real names as real", () => {
    expect(isPlaceholder("TBD")).toBe(true);
    expect(isPlaceholder("   ")).toBe(true);
    expect(isPlaceholder("Amina Nakato")).toBe(false);
    expect(isPlaceholder("Anne-Marie O'Brien")).toBe(false);
  });
});
