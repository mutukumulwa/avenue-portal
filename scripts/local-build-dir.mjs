#!/usr/bin/env node
/**
 * Keep the build output off iCloud Drive.
 *
 * This repository lives in `~/Library/Mobile Documents/com~apple~CloudDocs/…`,
 * so every file `next build` writes is synced. A production build is ~2 GB
 * across ~50k files, and the consequences are not theoretical — all of these
 * were observed on 2026-08-13:
 *
 *   * `cloudd`/`bird` saturate I/O; load average past 25
 *   * `next build` prints its version banner and then **hangs at 0% CPU
 *     indefinitely** (63 minutes, twice)
 *   * iCloud creates conflict copies *inside* `.next` — `cache 4`, `server 2`,
 *     `server 4`, `static 2`, `types 4` — after repeated build/delete cycles
 *   * `.next` reaches a state where even `ls` blocks and `rm -rf` makes no
 *     progress in 14 minutes
 *   * `vitest` then hangs too, because it globs the project root for test files
 *
 * ## Why not `distDir`
 *
 * The obvious fix is `distDir` in `next.config.ts`. It does not work here, and
 * the version-matched docs say so outright:
 *
 *   > `distDir` **should not** leave your project directory. For example,
 *   > `../build` is an **invalid** directory.
 *   — docs/vendor/nextjs-15.5.15/01-app/03-api-reference/05-config/
 *     01-next-config-js/distDir.mdx
 *
 * The project directory *is* the iCloud directory, so no value of `distDir`
 * gets the bytes out of it.
 *
 * ## What this does instead
 *
 * Makes `.next` a **symlink** to a directory under `~/Library/Caches`, which
 * iCloud does not sync. Next.js writes through the symlink without knowing;
 * `distDir` stays at its default, so **nothing about the deployed build
 * changes** — Vercel never runs this script and still produces a real `.next`
 * in its own checkout. That is the point of doing it this way rather than by
 * configuration: a config change would have to be conditional on `VERCEL`, and
 * a conditional that is wrong breaks deployment rather than a local build.
 *
 * ## The catch, and why the script also links `node_modules`
 *
 * Node resolves a symlink to its **real** path before resolving `require`, then
 * walks *up from there* looking for `node_modules`. With the output at
 * `~/Library/Caches/avenue-portal/next-build/`, the walk goes
 * `…/next-build/server/pages` → `…/next-build` → `…/avenue-portal` →
 * `~/Library/Caches` → `~/Library` → `~` → `/`, and the project — which is
 * where `node_modules` actually lives — is on none of it. The build compiles
 * fine and then dies during "Collecting page data" with
 * `Cannot find module 'react/jsx-runtime'`.
 *
 * So a second symlink puts the project's `node_modules` on that walk, one level
 * above the build directory. Nothing is copied, and the project's own
 * `node_modules` is untouched.
 *
 * Idempotent: safe to run before every build. Run `--status` to inspect.
 */

import { existsSync, lstatSync, mkdirSync, readlinkSync, renameSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const PROJECT = resolve(import.meta.dirname, "..");
const LINK = join(PROJECT, ".next");

/**
 * `~/Library/Caches` rather than `/tmp`: macOS prunes `/tmp` on reboot, and
 * losing the whole build cache on every restart trades one slow build for
 * another. It is keyed by project name so several checkouts do not collide.
 */
const CACHE_ROOT = join(homedir(), "Library", "Caches", "avenue-portal");
const TARGET = join(CACHE_ROOT, "next-build");
/** Puts the project's node_modules on Node's upward resolution walk. See above. */
const MODULES_LINK = join(CACHE_ROOT, "node_modules");
const PROJECT_MODULES = join(PROJECT, "node_modules");

function describe() {
  if (!existsSync(LINK)) return { state: "ABSENT" };
  const stat = lstatSync(LINK);
  if (stat.isSymbolicLink()) return { state: "LINKED", to: readlinkSync(LINK) };
  return { state: "REAL_DIRECTORY" };
}

if (process.argv.includes("--status")) {
  const info = describe();
  console.log(`.next        : ${info.state}${info.to ? ` -> ${info.to}` : ""}`);
  console.log(`target       : ${TARGET}`);
  console.log(
    `node_modules : ${existsSync(MODULES_LINK) ? `linked -> ${readlinkSync(MODULES_LINK)}` : "MISSING (page-data collection will fail)"}`,
  );
  console.log(
    info.state === "LINKED" && info.to === TARGET
      ? "\n  Build output is OFF iCloud.\n"
      : "\n  Build output is ON iCloud (or unlinked). Run this script with no arguments to fix.\n",
  );
  process.exit(0);
}

mkdirSync(TARGET, { recursive: true });

// Without this the build compiles and then fails collecting page data, because
// nothing on the output's ancestor chain has a node_modules.
if (!existsSync(MODULES_LINK)) {
  symlinkSync(PROJECT_MODULES, MODULES_LINK, "dir");
  console.log(`${MODULES_LINK} -> ${PROJECT_MODULES}`);
} else if (lstatSync(MODULES_LINK).isSymbolicLink() && readlinkSync(MODULES_LINK) !== PROJECT_MODULES) {
  // A different checkout claimed it. Repoint rather than silently building
  // against another project's dependencies.
  unlinkSync(MODULES_LINK);
  symlinkSync(PROJECT_MODULES, MODULES_LINK, "dir");
  console.log(`${MODULES_LINK} -> ${PROJECT_MODULES} (repointed)`);
}

const info = describe();

if (info.state === "LINKED" && info.to === TARGET) {
  console.log(`.next already points at ${TARGET}`);
  process.exit(0);
}

if (info.state === "LINKED") {
  // Pointing somewhere else — replace it. Unlinking a symlink never touches
  // whatever it points at.
  unlinkSync(LINK);
} else if (info.state === "REAL_DIRECTORY") {
  // A real `.next` on iCloud. Do NOT `rm -rf` it: that is the operation that
  // took 14 minutes without finishing. Rename is a metadata change and returns
  // immediately even when the directory is wedged.
  const parked = `${LINK}-preicloud-${process.pid}`;
  renameSync(LINK, parked);
  console.log(`Moved the existing iCloud .next aside: ${parked}`);
  console.log("  Delete it when iCloud releases it; it is not needed.");
}

symlinkSync(TARGET, LINK, "dir");
console.log(`.next -> ${TARGET}`);
console.log("Build output is now off iCloud.");
