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
 *   --release    every step. Skips and gaps are failures.
 *
 * Database steps are skipped without a Postgres URL. That is fine in
 * `--pre-push` and a failure in `--release`, which is the distinction the
 * acceptance draws.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const MODE = process.argv.includes("--release") ? "release" : "pre-push";
const DB_URL = process.env.GATE_DATABASE_URL ?? "";
const HAS_DB = DB_URL.startsWith("postgres");

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
    cmd: "npm run build:local",
  },
  {
    id: "4",
    name: "Fresh database — migrate from empty, then drift-check",
    phase: "release",
    db: true,
    cmd: [
      "npx prisma migrate deploy",
      // A fresh migrate must leave zero drift against schema.prisma. `db push`
      // reporting "already in sync" is the same assertion Prisma's own engine
      // makes during a deploy, and needs no shadow database.
      "npx prisma db push --skip-generate",
    ].join(" && "),
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
    id: "5b",
    name: "Policy parity — the canonical eligibility table across all four audiences",
    phase: "release",
    cmd: "npx tsx scripts/policy-parity-gate.ts --release",
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
  return { state: r.status === 0 ? "PASS" : "FAIL", ms: Date.now() - started };
}

function main() {
  if (!existsSync("package.json")) {
    console.error("Run this from the repository root.");
    process.exit(2);
  }

  console.log(`\n${C.bold}UAT-HF P12.04 verification gate${C.reset}  ${C.dim}mode=${MODE}${C.reset}`);
  console.log(`${C.dim}database steps: ${HAS_DB ? "enabled" : "no GATE_DATABASE_URL — will skip"}${C.reset}\n`);

  const results = [];
  for (const step of STEPS) {
    const inScope = MODE === "release" || step.phase === "pre-push";
    if (!inScope) {
      results.push({ step, state: "NOT-IN-MODE", ms: 0 });
      continue;
    }
    console.log(`${C.cyan}▶ step ${step.id} — ${step.name}${C.reset}`);
    const r = run(step);
    results.push({ step, ...r });
    if (r.state === "FAIL") break; // ordered gate: stop at the first failure
  }

  console.log(`\n${C.bold}Summary${C.reset}`);
  let failed = false;
  for (const { step, state, ms, why } of results) {
    const t = ms ? `${(ms / 1000).toFixed(1)}s` : "";
    let tag, colour;
    switch (state) {
      case "PASS":       tag = "PASS";        colour = C.green;  break;
      case "FAIL":       tag = "FAIL";        colour = C.red;    failed = true; break;
      case "SKIPPED":    tag = "SKIPPED";     colour = C.yellow;
        if (MODE === "release") failed = true;
        break;
      case "UNCOVERED":  tag = "NOT COVERED"; colour = C.yellow;
        if (MODE === "release") failed = true;
        break;
      default:           tag = "not in mode"; colour = C.dim;
    }
    console.log(`  ${colour}${tag.padEnd(11)}${C.reset} step ${step.id.padEnd(3)} ${step.name} ${C.dim}${t}${why ? `(${why})` : ""}${C.reset}`);
    if (state === "UNCOVERED") {
      console.log(`${C.dim}              ↳ ${step.needs}${C.reset}`);
    }
  }

  const uncovered = results.filter((r) => r.state === "UNCOVERED").length;
  if (uncovered > 0) {
    console.log(
      `\n${C.yellow}${uncovered} of the plan's 8 steps have no automation in this repository.${C.reset}\n` +
      `${C.dim}A green gate does NOT mean those were checked. P12.04's acceptance treats a skipped\n` +
      `critical check as a release failure, which is why --release exits non-zero above.${C.reset}`,
    );
  }

  if (failed) {
    console.log(`\n${C.red}${C.bold}GATE FAILED${C.reset}\n`);
    process.exit(1);
  }
  console.log(`\n${C.green}${C.bold}GATE PASSED${C.reset} ${C.dim}(${MODE})${C.reset}\n`);
}

main();
