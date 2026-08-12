# Vendored Next.js documentation — v15.5.15

**Do not hand-edit anything in this directory.** It is a verbatim copy of upstream documentation,
kept so that `AGENTS.md`'s "read the guide before writing code" rule is actually satisfiable.

| Field | Value |
|---|---|
| Source | `https://github.com/vercel/next.js` |
| Tag | `v15.5.15` |
| Commit | `412eb90b6587ec02e8361c92efa9091487e7348f` |
| Upstream path | `docs/` |
| Vendored | 2026-08-12, task **P00.02** |
| Size | 3.0 MB, 370 files |
| Matches installed Next | **yes** — `node_modules/next` is 15.5.15 |

## Why this exists

`AGENTS.md` required reading `node_modules/next/dist/docs/`. That directory does not exist, and
**no published Next release contains it** — verified two ways on 2026-08-12:

1. The installed `next@15.5.15` package has no `dist/docs`; its `dist/` holds only build/runtime
   output (`api`, `bin`, `build`, `cli`, `client`, `compiled`, `esm`, `lib`, `server`, …).
2. The jsDelivr file manifest for the published `next@15.5.15` tarball lists no path beginning
   `/dist/docs` and no file containing "docs" at all.

Next.js documentation lives in the GitHub repository under `docs/` and on nextjs.org — it is not
shipped to npm. So the instruction could never be followed as written. Rather than delete the rule
(which exists for a good reason: this Next version differs from model training data), the
version-matched official docs were vendored here and `AGENTS.md` repointed.

## Refreshing after a Next upgrade

Vendor the tag that matches the newly installed version, into a **new** sibling directory named for
that version, then update `AGENTS.md` and delete the old one. Never leave two versions live.

```bash
git clone --filter=blob:none --sparse --depth 1 --branch v<VERSION> https://github.com/vercel/next.js.git /tmp/nextdocs
```

```bash
cd /tmp/nextdocs && git sparse-checkout set docs
```

Then copy `/tmp/nextdocs/docs/.` into `docs/vendor/nextjs-<VERSION>/` and rewrite this file with the
new tag and commit SHA.

## Guide index for this remediation programme

Paths are relative to this directory. `01-app` is the App Router; this project uses it.
`02-pages` is the legacy Pages Router and is **not** what this codebase uses — do not read it by
mistake.

| Needed for | Guide |
|---|---|
| Server Actions | `01-app/01-getting-started/08-updating-data.mdx` |
| `use server` / `use client` directives | `01-app/03-api-reference/01-directives/` |
| Forms | `01-app/02-guides/forms.mdx` |
| Error boundaries (P01.04) | `01-app/01-getting-started/10-error-handling.mdx` |
| `error.tsx` / `global-error.tsx` file convention | `01-app/03-api-reference/03-file-conventions/error.mdx` |
| `not-found.tsx` | `01-app/03-api-reference/03-file-conventions/not-found.mdx` |
| `forbidden.tsx` / `unauthorized.tsx` (P03, P10) | `01-app/03-api-reference/03-file-conventions/forbidden.mdx`, `.../unauthorized.mdx` |
| Caching and revalidation | `01-app/01-getting-started/09-caching-and-revalidating.mdx`, `01-app/02-guides/caching.mdx` |
| `revalidatePath` / `revalidateTag` | `01-app/03-api-reference/04-functions/revalidatePath.mdx`, `.../revalidateTag.mdx` |
| Route handlers and middleware | `01-app/01-getting-started/15-route-handlers-and-middleware.mdx` |
| `route.ts` file convention | `01-app/03-api-reference/03-file-conventions/route.mdx` |
| Data security / taint (P11.05 minimum-necessary) | `01-app/02-guides/data-security.mdx` |
| Authentication (P10) | `01-app/02-guides/authentication.mdx` |
| Redirecting (P02, P08 — `redirect()` throws) | `01-app/02-guides/redirecting.mdx` |

**Note for P01.04:** there is no separate `global-error.mdx` in this version — `global-error.tsx`
is documented inside `03-file-conventions/error.mdx`.
