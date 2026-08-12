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
]);

export default eslintConfig;
