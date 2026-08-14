#!/usr/bin/env node
/**
 * UAT-HF P12.04 — the automated verification gate.
 *
 * The plan lists eight checks to run in order, and one acceptance criterion that
 * matters more than the list: **"zero unexplained failure; flaky or skipped
 * critical test is a release failure."**
 *
 * That sentence is why this script exists rather than a README. A gate that
 * silently omits a check is worse than no gate, because a green run then means
 * something different from what the reader assumes. So every step below is
 * either RUN or reported as NOT COVERED — never quietly absent — and in
 * `--release` mode a NOT COVERED step fails the gate.
 *
 * ## A correction to the plan's list
 *
 * The plan's eight steps do not include `next build`. They should. On
 * 2026-08-13 a `"use server"` export rule shipped a broken `main` while
 * typecheck, ESLint and Vitest all passed — that class of failure is invisible
 * to every other step here (see AGENTS.md). It runs as step 3b.
 *
 * ## Modes
 *
 *   --pre-push   (default) steps 1-3b. What a developer runs before pushing.
 *   --release    every step. Skips, gaps and known failures are all failures.
 *   --ci         every step, but the gaps this repository has not closed yet do
 *                not turn the run red: steps with no automation at all
 *                (`needs`), and the one step expected to fail today
 *                (`knownFail`). Everything else does.
 *
 * `--ci` exists because the alternative was worse. CI used to run this script
 * under `|| true` and then re-execute a hand-copied subset of these commands in
 * YAML, because `--release` is red by design while steps 6-8 have no
 * automation. That gave the repository two implementations of one list, and
 * they drifted: the YAML kept `prisma db push --skip-generate` for a day after
 * this file had dropped it — a flag Prisma 7 removed and exits 1 on. One list,
 * one exit code, and a mode that names the gaps it tolerates.
 *
 * A tolerated gap is not a silent one. `--ci` fails if a `knownFail` step
 * starts PASSING, so the marker cannot outlive the debt it records.
 *
 * Database steps are skipped without a Postgres URL. That is fine in
 * `--pre-push` and a failure in `--release` and `--ci`, which is the
 * distinction the acceptance draws — CI provides a Postgres service, so a skip
 * there means the wiring broke rather than that a database was unavailable.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const MODE = process.argv.includes("--release")
  ? "release"
  : process.argv.includes("--ci")
    ? "ci"
    : "pre-push";
/** `--release` and `--ci` run the same steps; only the verdict differs. */
const RUNS_EVERY_STEP = MODE === "release" || MODE === "ci";
const DB_URL = process.env.GATE_DATABASE_URL ?? "";
const HAS_DB = DB_URL.startsWith("postgres");

/**
 * Which result states end the run non-zero, per mode. One table rather than
 * `if (MODE === …)` scattered through the summary, so that the whole difference
 * between the modes is a thing you can read in one place — and so that adding a
 * state forces you to decide what each mode does with it.
 */
const FAILING_STATES = {
  "pre-push": new Set(["FAIL", "NOW-PASSING", "NOT-RUN"]),
  ci: new Set(["FAIL", "SKIPPED", "NOW-PASSING", "NOT-RUN"]),
  release: new Set(["FAIL", "SKIPPED", "UNCOVERED", "KNOWN-FAIL", "NOW-PASSING", "NOT-RUN"]),
};

const C = {
  reset: "[0m", dim: "[2m", bold: "[1m",
  green: "[32m", red: "[31m", yellow: "[33m", cyan: "[36m",
};

/**
 * @typedef {object} Step
 * @property {string}  id     Plan step number.
 * @property {string}  name
 * @property {"pre-push"|"release"} phase Earliest mode that runs it.
 * @property {string=} cmd    Shell command; absent means NOT COVERED.
 * @property {string=} needs  Why it cannot run here, when cmd is absent.
 * @property {boolean=} db    Requires GATE_DATABASE_URL.
 * @property {string=} knownFail  This step is expected to FAIL today, and the
 *                                value is why. Tolerated by `--ci`, never by
 *                                `--release`. If it passes, the gate fails and
 *                                tells you to delete the marker.
 */

/** @type {Step[]} */
const STEPS = [
  {
    id: "1",
    name: "TypeScript — npm run typecheck",
    phase: "pre-push",
    cmd: "npm run typecheck",
  },
  {
    id: "2",
    name: "ESLint — repository-wide, errors only",
    phase: "pre-push",
    // P00.02b cleared all 556 pre-existing errors, so the whole repo can gate on
    // zero ERRORS. Warnings are not a release failure and are not made one here.
    cmd: "npx eslint . --max-warnings=-1",
  },
  {
    // UAT-HF DEC-16. Pre-push rather than release, deliberately: it needs no
    // database and takes under a second, and the defect it catches is created
    // at the moment somebody writes a permission string. Release mode runs
    // pre-push steps too, so it gates both.
    //
    // Five permissions reached this branch checkable by nobody but SUPER_ADMIN
    // — four declared beside their call sites and never catalogued, plus
    // `provider.preauth.cancel` catalogued and granted to no role. Typecheck,
    // lint and 4,100 tests were green on every one of them, because a string
    // that matches nothing is valid code. Each was found by a person reading
    // tables, which is not a control.
    id: "2b",
    name: "RBAC drift — every permission code is defined, and somebody can hold it",
    phase: "pre-push",
    cmd: "node scripts/rbac-drift-check.mjs",
  },
  {
    id: "3",
    name: "Vitest — full suite",
    phase: "pre-push",
    cmd: "npx vitest run",
  },
  {
    id: "3b",
    name: "next build — the gate the plan's list omits (see header)",
    phase: "pre-push",
    // `npm run build:local` first points `.next` at a directory outside
    // iCloud Drive. Without that this step hung at 0% CPU for 63 minutes
    // on 2026-08-13 — see scripts/local-build-dir.mjs.
    //
    // A runner has no iCloud and no ~/Library, so there it builds in place.
    // Left unconditional, local-build-dir.mjs would cheerfully create
    // /home/runner/Library/Caches/avenue-portal and symlink `.next` into it:
    // working, but for a reason that does not exist on that machine.
    cmd: process.env.CI ? "SCHEMA_DEPLOY_MODE=skip npx next build" : "npm run build:local",
  },
  {
    id: "4",
    name: "Fresh database — migrate from empty, then drift-check",
    phase: "release",
    db: true,
    cmd: [
      "npx prisma migrate deploy",
      // A fresh migrate must leave zero drift against schema.prisma.
      //
      // This was `prisma db push`, which is the wrong instrument: db push
      // RESOLVES a difference by writing to the database. On a fresh CI
      // database the diff is empty and it passes, so it looks like a check —
      // but the moment there IS drift it silently applies it and reports
      // success, which is the only case the step exists for. `migrate diff` is
      // read-only by documented contract and `--exit-code` makes a non-empty
      // diff exit 2, which is the assertion this step always claimed to make.
      //
      // (`db push --skip-generate` was worse still: Prisma 7 removed the flag
      // and exits 1 on "unknown or unexpected option", so chained with && this
      // step was UNPASSABLE and would have read as a schema problem. Found on
      // 2026-08-14 while verifying a migration against real Postgres.)
      "npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code",
    ].join(" && "),
  },
  {
    // UAT-HF P12.04d — layer (c) of the RBAC drift check. Step 2b reads SOURCE
    // and belongs at pre-push; it cannot see a database that disagrees with
    // correct code. On 2026-08-14 production held 80 of 84 permissions for
    // SUPER_ADMIN — the four newest missing — with nothing wrong in the source.
    // Only the wildcard in ROLE_GRANTS kept that from mattering.
    //
    // Read-only. It prints remediation SQL and never runs it.
    id: "4b",
    name: "RBAC live drift — the database holds what the seed says it should",
    phase: "release",
    db: true,
    cmd: "npx tsx scripts/rbac-live-drift-check.ts --release",
  },
  {
    id: "5",
    name: "Upgrade database — preflight, then migrate onto existing data",
    phase: "release",
    db: true,
    cmd: [
      "npx tsx scripts/reports/member-identity-preflight.ts",
      "npx prisma migrate deploy",
    ].join(" && "),
  },
  {
    id: "6",
    name: "Browser tests — Chromium + one non-Chromium engine (date/input behaviour)",
    phase: "release",
    needs:
      "No browser test infrastructure exists in this repo (no Playwright config, no e2e directory). " +
      "jsdom cannot answer this: the step exists precisely because date and number INPUTS behave " +
      "differently per engine, which is what DEF-018 and DEF-020 turned on.",
  },
  {
    id: "7",
    name: "Network-fault tests — before-write failure, response loss, worker restart, replay, stale tab, offline reconnect",
    phase: "release",
    needs:
      "Needs a running app plus fault injection at the network and worker boundary. The unit suite " +
      "covers the SERVICE-level guarantees (idempotency keys, conditional updates, outbox replay), " +
      "but not the browser-to-worker path end to end.",
  },
  {
    // UAT-HF P03.06. Not in the plan's list of eight, and it belongs here: the
    // plan states it as a release condition in its own right — "Release fails
    // if authoring projection, member display, provider decision, and
    // claim/preauth enforcement disagree." A gate nobody runs is a document.
    //
    // It is EXPECTED TO FAIL today, and that is the point: two of the four
    // audiences do not consult the shared policy read model at all. Do not
    // silence it by narrowing the audience list.
    //
    // `knownFail` is how that is said out loud. `--release` still fails on it,
    // because it is a genuine release blocker. `--ci` reports KNOWN FAIL and
    // stays green — and fails the moment this starts passing, so the marker
    // leaves with the debt. That is the difference between recording a gap and
    // hiding one, and it is why CI no longer needs `|| true` to survive this
    // step.
    id: "5b",
    name: "Policy parity — the canonical eligibility table across all four audiences",
    phase: "release",
    cmd: "npx tsx scripts/policy-parity-gate.ts --release",
    knownFail:
      "Two of the four audiences do not consult the shared policy read model. " +
      "UAT-HF P03.06 is open; this step is what will tell you when it closes.",
  },
  {
    id: "8",
    name: "Accessibility — computed names, keyboard, focus, 360px, 200% zoom, reduced motion",
    phase: "release",
    needs:
      "Partially covered by tests/a11y/icon-button-names.test.ts and " +
      "tests/components/form-accessible-names.test.tsx, which compute accessible names by RENDERING " +
      "(a source scan was measured wrong by two orders of magnitude — see DEF-074). Keyboard order, " +
      "focus visibility, 360px reflow, 200% zoom and reduced motion all need a real browser.",
  },
];

function run(step) {
  const started = Date.now();

  if (!step.cmd) {
    return { state: "UNCOVERED", ms: 0 };
  }
  if (step.db && !HAS_DB) {
    return { state: "SKIPPED", ms: 0, why: "GATE_DATABASE_URL not set" };
  }

  const env = { ...process.env };
  if (step.db) {
    env.DATABASE_URL = DB_URL;
    env.DIRECT_URL = DB_URL;
  }

  const r = spawnSync(step.cmd, { shell: true, stdio: "inherit", env });
  const ms = Date.now() - started;

  if (step.knownFail) {
    // A step recorded as expected-to-fail that PASSES is not good news to be
    // swallowed quietly: the marker has become a lie, and while it stands
    // `--ci` would tolerate a genuine regression here. Fail until it is gone.
    return r.status === 0 ? { state: "NOW-PASSING", ms } : { state: "KNOWN-FAIL", ms };
  }
  return { state: r.status === 0 ? "PASS" : "FAIL", ms };
}

function main() {
  if (!existsSync("package.json")) {
    console.error("Run this from the repository root.");
    process.exit(2);
  }

  console.log(`\n${C.bold}UAT-HF P12.04 verification gate${C.reset}  ${C.dim}mode=${MODE}${C.reset}`);
  console.log(`${C.dim}database steps: ${HAS_DB ? "enabled" : "no GATE_DATABASE_URL — will skip"}${C.reset}\n`);

  const results = [];
  let stopped = false;
  for (const step of STEPS) {
    const inScope = RUNS_EVERY_STEP || step.phase === "pre-push";
    if (!inScope) {
      results.push({ step, state: "NOT-IN-MODE", ms: 0 });
      continue;
    }
    if (stopped) {
      // The gate is ordered and stops at the first real failure. Record what
      // that cost rather than dropping it: this loop used to `break`, and every
      // step after the failure then vanished from the summary altogether —
      // the exact silence this file opens by arguing against.
      results.push({ step, state: "NOT-RUN", ms: 0, why: "an earlier step failed" });
      continue;
    }
    console.log(`${C.cyan}▶ step ${step.id} — ${step.name}${C.reset}`);
    const r = run(step);
    results.push({ step, ...r });
    if (r.state === "FAIL") stopped = true;
  }

  /** Display only. Whether a state is fatal is FAILING_STATES' business. */
  const TAGS = {
    PASS: ["PASS", C.green],
    FAIL: ["FAIL", C.red],
    SKIPPED: ["SKIPPED", C.yellow],
    UNCOVERED: ["NOT COVERED", C.yellow],
    "KNOWN-FAIL": ["KNOWN FAIL", C.yellow],
    "NOW-PASSING": ["NOW PASSING", C.red],
    "NOT-RUN": ["NOT RUN", C.yellow],
    "NOT-IN-MODE": ["not in mode", C.dim],
  };

  console.log(`\n${C.bold}Summary${C.reset}`);
  let failed = false;
  for (const { step, state, ms, why } of results) {
    const t = ms ? `${(ms / 1000).toFixed(1)}s` : "";
    const [tag, colour] = TAGS[state] ?? [state, C.dim];
    if (FAILING_STATES[MODE].has(state)) failed = true;

    console.log(`  ${colour}${tag.padEnd(11)}${C.reset} step ${step.id.padEnd(3)} ${step.name} ${C.dim}${t}${why ? `(${why})` : ""}${C.reset}`);
    if (state === "UNCOVERED") {
      console.log(`${C.dim}              ↳ ${step.needs}${C.reset}`);
    } else if (state === "KNOWN-FAIL") {
      console.log(`${C.dim}              ↳ known failure: ${step.knownFail}${C.reset}`);
    } else if (state === "NOW-PASSING") {
      console.log(
        `${C.red}              ↳ marked knownFail in scripts/verification-gate.mjs, and it PASSED.\n` +
        `                Delete the marker — the debt it recorded is paid, and while it\n` +
        `                stands --ci would tolerate a real regression here.${C.reset}`,
      );
    }
  }

  const uncovered = results.filter((r) => r.state === "UNCOVERED").length;
  const known = results.filter((r) => r.state === "KNOWN-FAIL").length;
  if (uncovered > 0 || known > 0) {
    console.log(
      `\n${C.yellow}${uncovered} of the plan's 8 steps have no automation in this repository, ` +
      `and ${known} recorded known failure${known === 1 ? "" : "s"} ${known === 1 ? "is" : "are"} tolerated by --ci.${C.reset}\n` +
      `${C.dim}A green gate does NOT mean those were checked. P12.04's acceptance treats a skipped\n` +
      `critical check as a release failure, which is why --release exits non-zero on them and\n` +
      `--ci does not. Do not read a green --ci run as release readiness.${C.reset}`,
    );
  }

  if (failed) {
    console.log(`\n${C.red}${C.bold}GATE FAILED${C.reset}\n`);
    process.exit(1);
  }
  console.log(`\n${C.green}${C.bold}GATE PASSED${C.reset} ${C.dim}(${MODE})${C.reset}\n`);
}

main();
