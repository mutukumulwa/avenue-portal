# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your
training data. **Read the relevant guide before writing any code.** Heed deprecation notices.

Installed version: **Next 15.5.15**, App Router, React 19.2.4.

## Where the guides are

`docs/vendor/nextjs-15.5.15/` — the official Next.js documentation for the exact installed version,
vendored from `vercel/next.js` at tag `v15.5.15`.

**Start at `docs/vendor/nextjs-15.5.15/PROVENANCE.md`.** It carries a guide index that maps common
tasks (Server Actions, forms, error boundaries, caching and revalidation, route handlers,
data security, authentication, redirects) to exact file paths.

Read `01-app/**`. `02-pages/**` is the legacy Pages Router and is **not** what this codebase uses.

> This previously pointed at `node_modules/next/dist/docs/`. That directory does not exist, and no
> published Next release ships it — the documentation lives in the GitHub repository and on
> nextjs.org, never in the npm tarball. The rule was unfollowable as written, so the version-matched
> docs were vendored instead. See `PROVENANCE.md` for the verification and for how to refresh after
> an upgrade. Changed 2026-08-12 under task P00.02 of the UAT-HF remediation, with owner approval.

## Verification commands

There is **no `npm test` script**.

```bash
npm run typecheck
```

```bash
npx vitest run <test-files>
```

```bash
npx eslint <changed-files>
```

### Those three are not sufficient. Build before you push.

```bash
SCHEMA_DEPLOY_MODE=skip npx next build
```

Some rules exist only in SWC and the Next compiler, so typecheck, lint and tests **all pass on code
that cannot be built**. The one that shipped a broken `main` on 2026-08-13: a `"use server"` module
may export async functions and nothing else, and `export const MAX_MEMBER_LEN = 64` beside a server
action fails with *"Only async functions are allowed to be exported in a `"use server"` file."*
Nothing but `next build` sees it.

`SCHEMA_DEPLOY_MODE=skip` keeps the build off your database; the deployed build uses `push` or
`migrate` (see `docs/uat-human-factors-remediation/SCHEMA_DEPLOYMENT.md`).

If a build fails with a stack entirely inside `node_modules/next/dist/compiled/`, clear `.next` and
run it again before diagnosing — webpack's WASM hasher crashes non-deterministically against a stale
cache (`WasmHash._updateWithBuffer`, *"Cannot read properties of undefined (reading 'length')"*).
