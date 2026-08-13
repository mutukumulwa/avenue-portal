"use client";

/**
 * UAT-HF P11.05 — the household, collapsed by default (DEF-080, DEC-10).
 *
 * DEF-080: "Opening a member profile renders, with no interaction at all: the
 * family unit inline — ... a MINOR dependant's full name, member number and age
 * appear on the principal's landing view ... This is the screen an agent has
 * open with a member standing at the counter, and with anyone behind them able
 * to read it."
 *
 * The register also points out the fix is already the page's own pattern:
 * "Benefits, Dependants, Claims & Pre-Auths, Activity Log and Correspondence
 * each require a deliberate click — which makes the inline household summary the
 * outlier rather than the pattern."
 *
 * The dependants are **fetched on expand**, not passed as props. DEC-10 is
 * explicit that hidden data "must never be serialized into client HTML or
 * network payloads 'just to hide it with CSS'" — and a prop is a payload. What
 * the server renders by default is a count.
 */

import { useState, useTransition } from "react";
import { Users, ChevronDown, AlertCircle } from "lucide-react";
import { FamilyTreeView } from "./FamilyTreeView";
import { loadHouseholdAction, type HouseholdMember } from "@/app/(admin)/members/[id]/reveal-actions";

export function HouseholdPanel({
  memberId,
  summaryLabel,
  highlightId,
}: {
  memberId: string;
  /** e.g. "2 dependants (1 under 18)" — counts only, never names. */
  summaryLabel: string;
  highlightId?: string;
}) {
  const [household, setHousehold] = useState<{
    principal: HouseholdMember;
    dependants: HouseholdMember[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const expand = () => {
    setError(null);
    startTransition(async () => {
      const result = await loadHouseholdAction(memberId);
      if (result.ok && result.data) setHousehold(result.data);
      else setError(result.ok ? "Nothing to show." : result.message);
    });
  };

  if (household) {
    return (
      <FamilyTreeView
        principal={household.principal}
        dependants={household.dependants}
        highlightId={highlightId}
      />
    );
  }

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Users size={14} className="text-brand-indigo" />
        <h3 className="text-sm font-semibold text-brand-text-heading">Family Unit</h3>
        <span className="text-sm text-brand-text-body">{summaryLabel}</span>
        <button
          type="button"
          onClick={expand}
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-indigo hover:underline disabled:opacity-50"
        >
          <ChevronDown size={12} />
          {pending ? "Loading…" : "Show dependants"}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-brand-text-muted">
        Names are shown only when you ask for them, so a screen at the counter does not display a
        household to whoever is next in the queue.
      </p>
      {error && (
        <p role="alert" className="mt-2 inline-flex items-center gap-1 text-xs text-[#DC3545]">
          <AlertCircle size={12} />
          {error}
        </p>
      )}
    </div>
  );
}
