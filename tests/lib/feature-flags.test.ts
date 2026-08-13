/**
 * UAT-HF P12.03 acceptance — "rollback disables new entry paths while existing
 * receipts/jobs/events remain readable and finish safely."
 *
 * The plan also says, in bold: "Do not use one global flag."
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEPLOY_ORDER,
  FEATURE_FLAGS,
  canStart,
  flagSnapshot,
  parseFlagValue,
  type FeatureFlag,
} from "@/lib/feature-flags";

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("P12.03 separate flags, not one global switch", () => {
  it("names every capability the plan lists", () => {
    const expected = [
      "ENTITLEMENT_ENFORCEMENT",
      "IMPORT_DURABLE_LEDGER",
      "LIFECYCLE_COMMANDS",
      "OFFLINE_SYNC_TYPES",
      "PACKAGE_APPROVALS",
      "PRIVACY_REVEAL",
    ];
    expect(Object.keys(FEATURE_FLAGS).sort()).toEqual(expected.sort());
  });

  it("gives each one its own environment variable", () => {
    const envs = Object.values(FEATURE_FLAGS).map((f) => f.env);
    expect(new Set(envs).size).toBe(envs.length);
  });

  it("turning one off leaves the others alone", () => {
    process.env.FLAG_PACKAGE_APPROVALS = "off";
    expect(canStart("PACKAGE_APPROVALS")).toBe(false);
    expect(canStart("LIFECYCLE_COMMANDS")).toBe(true);
    expect(canStart("IMPORT_DURABLE_LEDGER")).toBe(true);
  });
});

describe("P12.03 the flag gates STARTING, never finishing", () => {
  it("exposes canStart and no processing/completion gate", () => {
    // The acceptance's second half: a rollback must not strand an import that
    // is mid-run or an outbox row mid-projection. A worker that stopped
    // draining because a flag flipped would turn a rollback into DEF-068.
    const src = readFileSync("src/lib/feature-flags.ts", "utf8");
    expect(src).toContain("export function canStart");
    expect(src).not.toMatch(/export function (isProcessingEnabled|canFinish|canProcess|canDrain)/);
  });

  it("says so where the next reader will look", () => {
    const src = readFileSync("src/lib/feature-flags.ts", "utf8");
    expect(src).toMatch(/gates \*\*starting\*\* something, never \*\*finishing\*\*/);
  });
});

describe("P12.03 parsing is forgiving in one direction only", () => {
  it.each(["1", "true", "TRUE", " on ", "yes", "enabled"])("reads %s as on", (v) => {
    expect(parseFlagValue(v)).toBe(true);
  });

  it.each(["0", "false", "off", "no", "disabled"])("reads %s as off", (v) => {
    expect(parseFlagValue(v)).toBe(false);
  });

  it("a TYPO does not silently disable a control", () => {
    // "flase", "of", "disable" — an unrecognised value falls back to the
    // documented default rather than being treated as off, so a slip in a
    // Vercel variable cannot quietly turn a control off.
    expect(parseFlagValue("flase")).toBeUndefined();
    expect(parseFlagValue("")).toBeUndefined();
    expect(parseFlagValue(undefined)).toBeUndefined();

    process.env.FLAG_PACKAGE_APPROVALS = "flase";
    expect(canStart("PACKAGE_APPROVALS")).toBe(true); // the default, not off
  });
});

describe("P12.03 defaults point the safe way, which is not always off", () => {
  it("entitlement enforcement is OFF until its readiness report reads zero", () => {
    // Enabling it against incomplete entitlement data denies claims for
    // providers that are legitimately contracted.
    expect(FEATURE_FLAGS.ENTITLEMENT_ENFORCEMENT.default).toBe(false);
    expect(canStart("ENTITLEMENT_ENFORCEMENT")).toBe(false);
  });

  it("privacy reveal is ON, because off reproduces the live blocker", () => {
    // Defaulting this off would mean nobody can reveal a masked national ID —
    // which is the operational blocker currently open in production. The
    // permission check is the real control.
    expect(FEATURE_FLAGS.PRIVACY_REVEAL.default).toBe(true);
    expect(canStart("PRIVACY_REVEAL")).toBe(true);
  });

  it("governance flags default ON, because reverting to ungoverned is not a rollback", () => {
    expect(FEATURE_FLAGS.PACKAGE_APPROVALS.default).toBe(true);
    expect(FEATURE_FLAGS.LIFECYCLE_COMMANDS.default).toBe(true);
  });

  it("every flag records which direction is safe and what it gates", () => {
    for (const [name, spec] of Object.entries(FEATURE_FLAGS)) {
      expect(["on", "off"], name).toContain(spec.safeDirection);
      expect(spec.gates.length, name).toBeGreaterThan(20);
    }
  });
});

describe("P12.03 the snapshot supports a rollback decision", () => {
  it("reports effective state and whether it was overridden", () => {
    process.env.FLAG_ENTITLEMENT_ENFORCEMENT = "on";
    const snap = flagSnapshot();
    const ent = snap.find((s) => s.flag === "ENTITLEMENT_ENFORCEMENT")!;
    expect(ent.effective).toBe(true);
    expect(ent.default).toBe(false);
    expect(ent.overridden).toBe(true);

    const pkg = snap.find((s) => s.flag === "PACKAGE_APPROVALS")!;
    expect(pkg.overridden).toBe(false);
  });

  it("covers every flag", () => {
    const flags = Object.keys(FEATURE_FLAGS) as FeatureFlag[];
    expect(flagSnapshot().map((s) => s.flag).sort()).toEqual([...flags].sort());
  });
});

describe("P12.03 the deploy order is data, not just prose", () => {
  it("ends with the fail-closed flag", () => {
    // "foundations/error containment → … → fail-closed flags"
    expect(DEPLOY_ORDER[DEPLOY_ORDER.length - 1].stage).toMatch(/fail-closed/i);
  });

  it("puts backfills before the guards that depend on them", () => {
    const stages = DEPLOY_ORDER.map((s) => s.stage);
    expect(stages.indexOf("data backfills")).toBeLessThan(stages.indexOf("contract guard"));
    expect(stages.indexOf("entitlement shadow mode")).toBeLessThan(
      stages.findIndex((s) => /fail-closed/i.test(s)),
    );
  });
});
