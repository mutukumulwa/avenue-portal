/**
 * DEC-FH-X11 test support: an in-memory stand-in for the few Prisma calls the
 * totals surfaces make, so their tests assert on the FIGURES a page shows — a
 * withdrawn claim listed but not counted — instead of on query shapes.
 *
 * It evaluates `where` for the operators those calls use (equality, null, in,
 * notIn, not, gte/lte/gt/lt, one level of relation filter per nesting, AND/OR)
 * and answers findMany (distinct, take), findFirst, findUnique, count,
 * aggregate (_count, _sum, _avg) and groupBy. Anything else is a test bug and
 * throws, rather than returning something plausible.
 */
import { vi } from "vitest";

export type Row = Record<string, unknown>;

const OPERATORS = new Set(["in", "notIn", "not", "gte", "lte", "gt", "lt"]);

function compare(a: unknown, b: unknown): number {
  const x = a instanceof Date ? a.getTime() : Number(a);
  const y = b instanceof Date ? b.getTime() : Number(b);
  return x - y;
}

export function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === "AND") return (cond as Row[]).every((w) => matches(row, w));
    if (key === "OR") return (cond as Row[]).some((w) => matches(row, w));
    if (cond === undefined) return true;
    const value = row[key];
    if (cond === null) return value == null;
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    if (typeof cond === "object" && !Array.isArray(cond)) {
      const c = cond as Row;
      const keys = Object.keys(c);
      if (keys.length > 0 && keys.every((k) => OPERATORS.has(k))) {
        if ("in" in c && !(c.in as unknown[]).includes(value)) return false;
        if ("notIn" in c && (c.notIn as unknown[]).includes(value)) return false;
        if ("not" in c && (c.not === null ? value == null : value === c.not)) return false;
        if ("gte" in c && c.gte != null && !(compare(value, c.gte) >= 0)) return false;
        if ("lte" in c && c.lte != null && !(compare(value, c.lte) <= 0)) return false;
        if ("gt" in c && c.gt != null && !(compare(value, c.gt) > 0)) return false;
        if ("lt" in c && c.lt != null && !(compare(value, c.lt) < 0)) return false;
        return true;
      }
      // A relation filter: the related row must match.
      return value != null && typeof value === "object" && matches(value as Row, c);
    }
    return value === cond;
  });
}

type Args = {
  where?: Row;
  distinct?: string[];
  take?: number;
  by?: string[];
  _count?: true | { _all?: true };
  _sum?: Record<string, true>;
  _avg?: Record<string, true>;
};

function aggregateOf(rows: Row[], args: Args): Row {
  const out: Row = {};
  if (args._count === true) out._count = rows.length;
  else if (args._count) out._count = { _all: rows.length };
  if (args._sum) {
    out._sum = Object.fromEntries(
      Object.keys(args._sum).map((field) => [field, rows.reduce((s, r) => s + Number(r[field] ?? 0), 0)]),
    );
  }
  if (args._avg) {
    out._avg = Object.fromEntries(
      Object.keys(args._avg).map((field) => {
        const vals = rows.map((r) => r[field]).filter((v) => v != null).map(Number);
        return [field, vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null];
      }),
    );
  }
  return out;
}

/** A model whose rows are read at call time, so a test can swap the data. */
export function fakeModel(rows: () => Row[]) {
  const filter = (args?: Args) => rows().filter((r) => matches(r, args?.where));
  return {
    findMany: vi.fn(async (args?: Args) => {
      let out = filter(args);
      if (args?.distinct) {
        const seen = new Set<string>();
        out = out.filter((r) => {
          const key = args.distinct!.map((d) => String(r[d])).join("|");
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      return args?.take ? out.slice(0, args.take) : out;
    }),
    findFirst: vi.fn(async (args?: Args) => filter(args)[0] ?? null),
    findUnique: vi.fn(async (args?: Args) => filter(args)[0] ?? null),
    count: vi.fn(async (args?: Args) => filter(args).length),
    aggregate: vi.fn(async (args: Args) => aggregateOf(filter(args), args)),
    groupBy: vi.fn(async (args: Args) => {
      const groups = new Map<string, Row[]>();
      for (const r of filter(args)) {
        const key = JSON.stringify(args.by!.map((b) => r[b]));
        groups.set(key, [...(groups.get(key) ?? []), r]);
      }
      return [...groups.entries()].map(([key, members]) => {
        const values = JSON.parse(key) as unknown[];
        return { ...Object.fromEntries(args.by!.map((b, i) => [b, values[i]])), ...aggregateOf(members, args) };
      });
    }),
  };
}
