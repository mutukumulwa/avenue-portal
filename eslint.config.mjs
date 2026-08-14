import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // …and any PARKED build directory. `.next` is a symlink to a location off
    // iCloud Drive (scripts/local-build-dir.mjs); when a previous real `.next`
    // has to be moved aside it becomes `.next-preicloud-<pid>`, and an ignore
    // anchored on the exact name does not cover it. Two such directories once
    // contributed 24,508 errors to a repo-wide lint that reads as source.
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scratch-*.ts",

    // UAT-HF P00.02. Repository-wide `npm run lint` previously did not finish
    // in useful time because ".next/**" is anchored at the repository root and
    // therefore does not match build output nested inside git worktrees.
    // Verification cannot be a release gate until it terminates, so exclude
    // every generated / non-source tree here.
    //
    // Deliberately NOT excluded: src, tests, scripts, prisma.
    "**/.next/**", // build output in any nested worktree
    ".claude/**", // agent worktrees, each with its own node_modules + .next
    "outputs/**", // UAT run evidence (198 MB); immutable, never linted
    "coverage/**",
    "docs/vendor/**", // verbatim upstream docs; never hand-edited, never linted
  ]),

  // UAT-HF P00.02b — `no-explicit-any` in test doubles and disposable UAT
  // harness scripts only. It stays FULLY ENFORCED in src/, which is now clean.
  //
  // Why this is scoped off rather than fixed:
  //
  //   tests/** builds fake Prisma clients with `vi.hoisted()` and injects them
  //   via `vi.mock("@/lib/prisma")`. Those objects are then passed straight into
  //   services that expect Prisma's generated `TransactionClient`. Removing
  //   `any` from them was attempted and measured: it produced 114 TypeScript
  //   errors, because a partial hand-rolled double cannot structurally satisfy
  //   Prisma's generated client type — that is the entire reason the doubles are
  //   partial. The `any` is load-bearing, not laziness.
  //
  //   scripts/uat*.ts are one-off harnesses written to drive a specific UAT run.
  //   They are disposable tooling, not shipped code, and are never imported by
  //   the application.
  //
  // What WAS fixed rather than suppressed, in the same task: all 37 errors in
  // src/, plus 179 genuinely mechanical annotations in tests/ (mock return
  // types, argument shapes, transaction callbacks) which are now typed through
  // tests/types/mock-db.d.ts. Every non-`any` error was fixed outright,
  // including a `var` hoisting out of its block and the `@ts-ignore` that was
  // masking it in scripts/uat-prior-defect-gate.ts.
  //
  // If the Prisma doubles are ever replaced with a generated/typed mock client,
  // delete this block.
  {
    files: ["tests/**/*.ts", "tests/**/*.tsx", "scripts/uat*.ts", "scripts/uat/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]);

export default eslintConfig;
