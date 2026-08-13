"use client";

/**
 * UAT-HF P11.05 — a masked field with an audited reveal (DEF-080, DEC-10).
 *
 * The masked value is what the server rendered; the full value never travelled
 * with the page. Pressing Show asks for it, with a purpose, and the server
 * audits the request before answering.
 *
 * "Expires on navigation" is satisfied by construction: the revealed value lives
 * in this component's state and nowhere else, so a route change discards it.
 * Nothing persists it, so nothing has to remember to clear it.
 */

import { useActionState, useState } from "react";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { revealMemberFieldAction, type RevealedValue } from "@/app/(admin)/members/[id]/reveal-actions";
import { MASKED_PLACEHOLDER, REVEAL_FIELD_LABELS, type RevealableField } from "@/lib/sensitive-detail";
import type { MutationResult } from "@/lib/mutation-contract";

export function RevealableDetail({
  memberId,
  field,
  masked,
}: {
  memberId: string;
  field: RevealableField;
  /** What the server rendered. Null when the member has no such value. */
  masked: string | null;
}) {
  const bound = revealMemberFieldAction.bind(null, memberId);
  const [state, action, pending] = useActionState<MutationResult<RevealedValue> | null, FormData>(
    bound,
    null,
  );
  const [asking, setAsking] = useState(false);

  if (!masked) return <span className="text-brand-text-muted">—</span>;

  const revealed = state?.ok && state.data?.field === field ? state.data.value : null;
  const failure = state && !state.ok ? state : null;

  if (revealed) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="font-mono">{revealed}</span>
        <span className="text-[10px] uppercase tracking-wide text-brand-text-muted">
          shown — recorded
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono" aria-label={`${REVEAL_FIELD_LABELS[field]}, hidden`}>
        {masked}
      </span>

      {!asking ? (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-indigo hover:underline"
        >
          <Eye size={12} />
          Show
        </button>
      ) : (
        <form action={action} className="inline-flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="field" value={field} />
          <label className="sr-only" htmlFor={`purpose-${field}`}>
            Why do you need to see this {REVEAL_FIELD_LABELS[field].toLowerCase()}?
          </label>
          <input
            id={`purpose-${field}`}
            name="purpose"
            required
            minLength={5}
            placeholder="Reason — recorded against your name"
            className="rounded border border-[#EEEEEE] px-2 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-brand-indigo px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {pending ? "…" : "Show"}
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="inline-flex items-center gap-1 text-xs text-brand-text-muted hover:underline"
          >
            <EyeOff size={12} />
            Cancel
          </button>
        </form>
      )}

      {failure && (
        <span role="alert" className="inline-flex items-center gap-1 text-xs text-[#DC3545]">
          <AlertCircle size={12} />
          {failure.message}
        </span>
      )}
    </span>
  );
}

/**
 * The collapsed household.
 *
 * DEF-080's specific harm was "a MINOR dependant's full name, member number and
 * age" on the landing view. A count answers the operational question — does this
 * member have dependants, how many, are any minors — without naming a child on a
 * screen with a queue behind it. Names live behind the Dependants tab, which the
 * page already gates by a deliberate click.
 */
export function HouseholdSummaryBlock({
  label,
  onOpenDependants,
}: {
  label: string;
  onOpenDependants?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-brand-text-heading">Family unit</span>
      <span className="text-brand-text-body">{label}</span>
      {onOpenDependants && (
        <button
          type="button"
          onClick={onOpenDependants}
          className="text-xs font-semibold text-brand-indigo hover:underline"
        >
          View dependants
        </button>
      )}
    </div>
  );
}

export { MASKED_PLACEHOLDER };
