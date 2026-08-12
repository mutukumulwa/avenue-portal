"use client";

/**
 * UAT-HF P04.05 — what a rejected stale save looks like (DEF-077).
 *
 * The acceptance requires that a conflict "preserve both submitted/current
 * values". A banner saying "this record changed, reload" satisfies the letter
 * and loses the work: the operator reloads, their typed values are gone, and
 * they have to remember what they were doing. So this renders the comparison,
 * field by field, with their values still on screen.
 *
 * The `untouched` column matters. DEF-077's stale whole-form write reverted "a
 * field neither operator intended to touch"; a field the operator never edited
 * is somebody else's change, and re-applying it would repeat the defect. Those
 * rows are labelled as keep-theirs rather than offered as a choice.
 */

import type { ConflictDetail } from "@/lib/concurrency";
import { formatInstant } from "@/lib/calendar-date";
import { AlertTriangle } from "lucide-react";

const EMPTY = "—";

export function ConflictNotice({ conflict }: { conflict: ConflictDetail | null | undefined }) {
  if (!conflict || conflict.fields.length === 0) return null;

  const yours = conflict.fields.filter((f) => !f.untouched);
  const theirs = conflict.fields.filter((f) => f.untouched);

  return (
    <div
      role="alert"
      className="mb-5 rounded-lg border border-[#FFC107]/50 bg-[#FFC107]/5 px-4 py-3"
      data-conflict-fields={conflict.fields.length}
    >
      <div className="flex items-center gap-2 text-[#856404]">
        <AlertTriangle size={15} className="shrink-0" />
        <p className="text-sm font-bold">
          Nothing was saved — somebody else changed this {conflict.entity} first
        </p>
      </div>

      {conflict.currentUpdatedAt && (
        <p className="mt-1 text-xs text-[#856404]">
          Last changed {formatInstant(new Date(conflict.currentUpdatedAt))}.
        </p>
      )}

      {yours.length > 0 && (
        <>
          <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[#856404]">
            Your changes, still here
          </p>
          <ComparisonTable rows={yours} />
        </>
      )}

      {theirs.length > 0 && (
        <>
          <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[#856404]">
            Changed by someone else — you did not edit these
          </p>
          <p className="mt-0.5 text-xs text-[#856404]">
            Saving your copy would have reverted them. Leave them as they are unless you mean to
            change them.
          </p>
          <ComparisonTable rows={theirs} />
        </>
      )}

      <p className="mt-3 text-xs text-[#856404]">
        Reload the {conflict.entity} to start from the current values, then re-apply the changes you
        still want.
      </p>
    </div>
  );
}

function ComparisonTable({ rows }: { rows: ConflictDetail["fields"] }) {
  return (
    <div className="mt-1.5 overflow-x-auto">
      <table className="w-full min-w-0 text-xs">
        <thead>
          <tr className="text-left text-[#856404]">
            <th scope="col" className="py-1 pr-4 font-semibold">
              Field
            </th>
            <th scope="col" className="py-1 pr-4 font-semibold">
              You entered
            </th>
            <th scope="col" className="py-1 font-semibold">
              Record now says
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field} className="border-t border-[#FFC107]/30 align-top">
              <th scope="row" className="py-1 pr-4 text-left font-medium text-[#856404]">
                {humanise(row.field)}
              </th>
              <td className="py-1 pr-4 font-mono text-brand-text-body">{row.submitted || EMPTY}</td>
              <td className="py-1 font-mono text-brand-text-body">{row.current || EMPTY}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "otherNames" -> "Other names". Field names reach the operator, so they read. */
export function humanise(field: string): string {
  const spaced = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
