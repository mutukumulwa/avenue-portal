/**
 * UAT run preflight — refuses to start a run that cannot produce a signed verdict.
 *
 * Closes DEF-001 from UAT-HF-20260811-01: that run executed all 456 steps and then
 * could not be signed off, because no accountable Business, Network-fault,
 * Data-reset or Privacy owner had ever been assigned. Three steps (R-001 s2,
 * R-003 s2, Z-004 s4) were Blocked on it, and the verdict is permanently unsigned.
 * The gap was in how the run was commissioned, not in the product — so the fix is
 * a gate that runs BEFORE step 1 and fails loudly.
 *
 * It also gates the harness capabilities that silently blocked seven further steps
 * in that run. Those could not be unblocked by ANY product fix: A-005 s4 needed a
 * mailbox the run did not have, F-006 s4 and Q-003 s4 needed download interception,
 * E-003 needed an exhausted-benefit fixture, and O-006 s4 needed cold-offline
 * navigation. Declaring a scenario that needs a capability the harness does not
 * have is now a preflight failure rather than a Blocked row discovered mid-run.
 *
 * This module NEVER edits a closed run. A retest is a new run ID and directory.
 *
 * CLI:
 *   npx tsx scripts/uat/run-preflight.ts <path-to-run-manifest.json>
 * Exits 0 when the run may start, 1 with a precise reason per failure otherwise.
 */

export const OWNER_ROLES = [
  "business",
  "security",
  "operations",
  "accessibility",
  "networkFault",
  "dataReset",
  "privacy",
] as const;
export type OwnerRole = (typeof OWNER_ROLES)[number];

/** Human-readable reason each owner must exist, quoted back in failure output. */
const OWNER_PURPOSE: Record<OwnerRole, string> = {
  business: "re-rates severity and accepts residual risk at sign-off",
  security: "accepts privacy/authorization findings",
  operations: "owns environment, flags and the deploy under test",
  accessibility: "accepts a11y findings and any expiry attached to them",
  networkFault: "authorises fault injection and confirms blast radius",
  dataReset: "owns the controlled data lanes and their cleanup",
  privacy: "approves what member data may be seen, revealed and captured",
};

export const HARNESS_CAPABILITIES = [
  "mailSink",
  "downloadInterception",
  "coldOfflineNavigation",
  "exhaustedBenefitFixture",
] as const;
export type HarnessCapability = (typeof HARNESS_CAPABILITIES)[number];

/** Why each capability exists, traced to the step that was blocked without it. */
const CAPABILITY_PURPOSE: Record<HarnessCapability, string> = {
  mailSink: "read password-reset and notification mail (A-005 s4 was Blocked without it)",
  downloadInterception: "retrieve and inspect downloaded files (F-006 s4, Q-003 s4)",
  coldOfflineNavigation: "distinguish a service-worker cache hit from surviving DOM (O-006 s4)",
  exhaustedBenefitFixture: "a member whose benefit balance is genuinely zero (E-003)",
};

export interface RunOracle {
  id: string;
  description: string;
  /** Where the expected value comes from — must be independent of the system under test. */
  source: string;
}

export interface RunActor {
  persona: string;
  role: string;
  provisioned: boolean;
}

export interface RunFixture {
  id: string;
  description: string;
  present: boolean;
}

export interface RunScenarioRequirement {
  id: string;
  requiresCapabilities?: HarnessCapability[];
}

export interface RunManifest {
  runId: string;
  buildSha: string;
  target: string;
  timezone: string;
  owners: Partial<Record<OwnerRole, string>>;
  oracles: RunOracle[];
  actors: RunActor[];
  fixtures: RunFixture[];
  flags: Record<string, unknown>;
  harnessCapabilities: Partial<Record<HarnessCapability, boolean>>;
  scenarios?: RunScenarioRequirement[];
}

export interface PreflightResult {
  ok: boolean;
  errors: string[];
}

/**
 * Values that look filled in but name nobody. A run that reaches sign-off with
 * "TBD" in the Business owner cell is exactly DEF-001.
 */
const PLACEHOLDER =
  /^(tbd|tba|todo|t\.b\.d\.?|n\/?a|na|none|nil|null|undefined|unknown|pending|xxx+|\?+|-+|—+|\.+|<.*>|\[.*\]|\{.*\})$/i;

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

/** True when the value is missing, whitespace, or a placeholder standing in for a real one. */
export function isPlaceholder(value: unknown): boolean {
  if (isBlank(value)) return true;
  return PLACEHOLDER.test((value as string).trim());
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a run manifest. Returns every failure at once — a run lead should see
 * the whole list, not fix one thing and rediscover the next.
 */
export function validateRunManifest(manifest: unknown): PreflightResult {
  const errors: string[] = [];
  const push = (field: string, problem: string) => errors.push(`${field}: ${problem}`);

  if (manifest === null || typeof manifest !== "object") {
    return { ok: false, errors: ["manifest: expected a JSON object."] };
  }
  const m = manifest as Partial<RunManifest>;

  // ── identity of the run ────────────────────────────────────────────────────
  if (isPlaceholder(m.runId)) {
    push("runId", 'missing. A retest MUST use a new run ID — never reuse or edit a closed run.');
  }
  if (isPlaceholder(m.buildSha)) {
    push("buildSha", "missing. Pin the exact commit under test before step 1.");
  } else if (!/^[0-9a-f]{7,40}$/i.test((m.buildSha as string).trim())) {
    push("buildSha", `"${m.buildSha}" is not a git SHA (expected 7–40 hex characters).`);
  }
  if (isPlaceholder(m.target)) {
    push("target", "missing. Record the exact URL or environment under test.");
  }
  if (isPlaceholder(m.timezone)) {
    push("timezone", "missing. Timestamp drift invalidated 93 cells in UAT-HF-20260811-01.");
  } else if (!isValidTimezone((m.timezone as string).trim())) {
    push("timezone", `"${m.timezone}" is not a valid IANA timezone (expected e.g. "Africa/Nairobi").`);
  }

  // ── owners (DEF-001) ───────────────────────────────────────────────────────
  const owners = (m.owners ?? {}) as Partial<Record<OwnerRole, string>>;
  for (const role of OWNER_ROLES) {
    const value = owners[role];
    if (isPlaceholder(value)) {
      const shown = isBlank(value) ? "not supplied" : `"${String(value).trim()}" is a placeholder, not a name`;
      push(
        `owners.${role}`,
        `${shown}. A named owner is required — this one ${OWNER_PURPOSE[role]}. (DEF-001)`,
      );
    }
  }

  // ── oracles ────────────────────────────────────────────────────────────────
  if (!Array.isArray(m.oracles) || m.oracles.length === 0) {
    push("oracles", "no oracle declared. Every run needs at least one independent expected-value source.");
  } else {
    m.oracles.forEach((o, i) => {
      if (isPlaceholder(o?.id)) push(`oracles[${i}].id`, "missing.");
      if (isPlaceholder(o?.description)) push(`oracles[${i}].description`, "missing.");
      if (isPlaceholder(o?.source)) {
        push(
          `oracles[${i}].source`,
          "missing. An oracle read from the system under test proves nothing — name an independent source.",
        );
      }
    });
  }

  // ── actors ─────────────────────────────────────────────────────────────────
  if (!Array.isArray(m.actors) || m.actors.length === 0) {
    push("actors", "no actor declared. Personas must be provisioned before step 1.");
  } else {
    m.actors.forEach((a, i) => {
      const who = isPlaceholder(a?.persona) ? `actors[${i}]` : `actors[${i}] (${a.persona})`;
      if (isPlaceholder(a?.persona)) push(`actors[${i}].persona`, "missing.");
      if (isPlaceholder(a?.role)) push(`${who}.role`, "missing.");
      if (a?.provisioned !== true) {
        push(
          `${who}.provisioned`,
          "is not provisioned. Substituting a persona mid-run makes the result unattributable.",
        );
      }
    });
  }

  // ── fixtures ───────────────────────────────────────────────────────────────
  if (!Array.isArray(m.fixtures)) {
    push("fixtures", "missing. Declare the controlled fixtures, even if the list is empty.");
  } else {
    m.fixtures.forEach((f, i) => {
      const who = isPlaceholder(f?.id) ? `fixtures[${i}]` : `fixtures[${i}] (${f.id})`;
      if (isPlaceholder(f?.id)) push(`fixtures[${i}].id`, "missing.");
      if (isPlaceholder(f?.description)) push(`${who}.description`, "missing.");
      if (f?.present !== true) {
        push(
          `${who}.present`,
          "is not present. A scenario that consumes a fixture before its creator runs is Blocked on ordering, not on the product.",
        );
      }
    });
  }

  // ── flags ──────────────────────────────────────────────────────────────────
  if (m.flags === null || typeof m.flags !== "object" || Array.isArray(m.flags)) {
    push("flags", "missing. Record the feature-flag state the run executes against.");
  }

  // ── harness capabilities ───────────────────────────────────────────────────
  const caps = (m.harnessCapabilities ?? {}) as Partial<Record<HarnessCapability, boolean>>;
  for (const cap of HARNESS_CAPABILITIES) {
    if (typeof caps[cap] !== "boolean") {
      push(
        `harnessCapabilities.${cap}`,
        `not declared (expected true or false). Needed to ${CAPABILITY_PURPOSE[cap]}.`,
      );
    }
  }

  // A scenario may not depend on a capability the harness does not have.
  if (Array.isArray(m.scenarios)) {
    m.scenarios.forEach((s, i) => {
      const id = isPlaceholder(s?.id) ? `scenarios[${i}]` : s.id;
      if (isPlaceholder(s?.id)) push(`scenarios[${i}].id`, "missing.");
      for (const cap of s?.requiresCapabilities ?? []) {
        if (!HARNESS_CAPABILITIES.includes(cap)) {
          push(`scenarios[${i}] (${id})`, `requires unknown capability "${cap}".`);
        } else if (caps[cap] !== true) {
          push(
            `scenarios[${i}] (${id})`,
            `requires harness capability "${cap}", which is not available. Provide it or remove the scenario — do not discover this as a Blocked row mid-run. Needed to ${CAPABILITY_PURPOSE[cap]}.`,
          );
        }
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

/** Render a result for a terminal. */
export function formatPreflightResult(runId: string, result: PreflightResult): string {
  if (result.ok) return `UAT preflight PASSED for ${runId}. The run may start.`;
  const lines = [
    `UAT preflight FAILED for ${runId} — ${result.errors.length} problem(s). The run must NOT start.`,
    "",
    ...result.errors.map((e) => `  ✗ ${e}`),
    "",
    "Fix every line above, then re-run this preflight. Do not begin step 1 until it passes.",
  ];
  return lines.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: npx tsx scripts/uat/run-preflight.ts <path-to-run-manifest.json>");
    process.exit(1);
  }
  const { readFile } = await import("node:fs/promises");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    console.error(`Could not read a JSON manifest at ${path}: ${(err as Error).message}`);
    process.exit(1);
  }
  const runId =
    parsed && typeof parsed === "object" && !isPlaceholder((parsed as RunManifest).runId)
      ? (parsed as RunManifest).runId
      : "(unnamed run)";
  const result = validateRunManifest(parsed);
  console[result.ok ? "log" : "error"](formatPreflightResult(runId, result));
  process.exit(result.ok ? 0 : 1);
}

// Only run the CLI when invoked directly, so tests can import the validator.
if (process.argv[1] && /run-preflight\.(ts|mjs|js)$/.test(process.argv[1])) {
  void main();
}
