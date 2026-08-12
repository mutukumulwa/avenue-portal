"use client";

/**
 * UAT-HF P01.06 — a table that survives 360 px and 200% zoom.
 *
 * DEF-009: "Admin tables do not reflow — horizontal scrolling at 200% zoom and
 * at 360 px." DEF-072 and DEF-076 are the same failure elsewhere, including a
 * member nav with clipped, unreachable items.
 *
 * The trap this fixes is specific and easy to reproduce: a wide table inside a
 * flex or grid child scrolls the whole PAGE instead of itself, because the child
 * defaults to `min-width: auto` and refuses to shrink below its content. The
 * result is a page-level horizontal trap where the sticky nav slides away and
 * some rows can never be reached on a small screen.
 *
 * So the scroll port here sets `min-w-0` on the wrapper and `overflow-x-auto` on
 * the port, keeping the scroll INSIDE the table. `tabIndex={0}` makes that port
 * reachable by keyboard, which is required for a scrollable region a mouse user
 * can drag but a keyboard user otherwise cannot.
 */
import type { ReactNode } from "react";

export interface DataTableColumn<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Keep this column visible while the rest scrolls (identity, actions). */
  sticky?: "left" | "right";
  className?: string;
}

export interface DataTableProps<Row> {
  /** Required. A table without an accessible name is unnavigable by screen reader. */
  caption: string;
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Shown instead of an empty <tbody>; pass an <EmptyState>. */
  empty?: ReactNode;
  className?: string;
}

const STICKY = {
  left: "sticky left-0 z-10 bg-brand-bg",
  right: "sticky right-0 z-10 bg-brand-bg",
} as const;

export function DataTable<Row>({ caption, columns, rows, rowKey, empty, className }: DataTableProps<Row>) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    // min-w-0 is load-bearing: without it a flex/grid parent refuses to shrink
    // this below its content width and the PAGE scrolls instead of the table.
    <div className={className ?? "min-w-0 max-w-full"}>
      <div
        // A scrollable region needs to be focusable, or a keyboard-only user
        // cannot reach the columns that are off-screen.
        tabIndex={0}
        role="region"
        aria-label={caption}
        className="min-w-0 w-full max-w-full overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
      >
        <table className="w-full min-w-max border-collapse text-sm">
          {/* sr-only, not hidden: it is the table's accessible name. */}
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-brand-border text-left text-xs uppercase text-brand-text-muted">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`whitespace-nowrap px-4 py-3 ${column.sticky ? STICKY[column.sticky] : ""} ${column.className ?? ""}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-brand-border/60">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 text-brand-text-body ${column.sticky ? STICKY[column.sticky] : ""} ${column.className ?? ""}`}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-brand-text-muted md:hidden">Scroll sideways to see all columns.</p>
    </div>
  );
}
