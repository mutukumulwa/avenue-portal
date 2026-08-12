/**
 * Shared shapes for the hand-rolled Prisma test doubles used across `tests/**`.
 *
 * These files build a fake `prisma` object with `vi.hoisted()` and inject it with
 * `vi.mock("@/lib/prisma")`. Reproducing Prisma's real generated types by hand is
 * not practical — they are large, deeply generic, and per-model — so the doubles
 * were originally annotated `any`, which repo-wide lint rejects
 * (`@typescript-eslint/no-explicit-any`, a P12.04 release gate).
 *
 * These aliases give the doubles honest, checked types instead: permissive about
 * which keys appear, but no longer `any`, so a typo in `.data`/`.where` is still
 * caught and the escape hatch cannot silently spread into production code.
 *
 * This file has no top-level import or export, so its declarations are global and
 * test files can use them without adding an import.
 */

/**
 * Arguments to a mocked Prisma model method — `create`, `update`, `findFirst`,
 * `findMany`, `upsert`, `count`, and friends. Every property is optional because
 * a given call site only supplies the ones it needs.
 */
type MockDbArgs = {
  where?: Record<string, unknown> & { id?: string };
  data?: Record<string, unknown>;
  select?: Record<string, unknown>;
  include?: Record<string, unknown>;
  orderBy?: unknown;
  take?: number;
  skip?: number;
  [key: string]: unknown;
};

/** A row returned by, or passed to, a mocked Prisma model method. */
type MockDbRow = Record<string, unknown>;

/**
 * Overrides accepted by the small fixture builders these tests define, e.g.
 * `const endorsement = (over: MockDbOverrides = {}) => ({ ...defaults, ...over })`.
 */
type MockDbOverrides = Record<string, unknown>;
