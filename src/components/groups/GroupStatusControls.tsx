"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertCircle, ShieldAlert } from "lucide-react";
import { changeGroupStatusAction } from "@/app/(admin)/groups/[id]/status/actions";
import type { GroupActionState } from "@/lib/validation/group";

export interface StatusTransition {
  target: string;
  label: string;
  requiresReason: boolean;
  override: boolean;
  tone: "primary" | "warn" | "danger";
}

const toneCls: Record<StatusTransition["tone"], string> = {
  primary: "border-brand-indigo/40 text-brand-indigo hover:bg-brand-indigo/5",
  warn: "border-[#FFC107]/50 text-[#856404] hover:bg-[#FFF8E1]",
  danger: "border-[#DC3545]/40 text-[#DC3545] hover:bg-[#DC3545]/5",
};

/**
 * WP-S2 — governed scheme lifecycle controls. The general edit form no longer
 * carries status; suspend / reactivate / terminate / lapse / governed-reinstate
 * all run through `changeGroupStatusAction` here, each with a required reason
 * (where applicable) and an optional effective date. The server enforces the
 * transition table and cascades to member eligibility, so this component only
 * needs to offer the VALID next moves (computed server-side and passed in).
 */
export function GroupStatusControls({
  groupId,
  currentStatus,
  transitions,
}: {
  groupId: string;
  currentStatus: string;
  transitions: StatusTransition[];
}) {
  const bound = changeGroupStatusAction.bind(null, groupId);
  const [state, action, pending] = useActionState<GroupActionState, FormData>(bound, { ok: true });
  const [selected, setSelected] = useState<StatusTransition | null>(null);

  // Close the form once a change is accepted (revalidatePath refreshes status).
  // Adjusted during render rather than in an effect, which would leave the form
  // briefly open after success and then re-render (react-hooks/set-state-in-effect).
  const [prevState, setPrevState] = useState(state);
  if (prevState !== state) {
    setPrevState(state);
    if (state.ok) setSelected(null);
  }

  const fieldErr =
    state && !state.ok ? state.fieldErrors?.targetStatus?.[0] : undefined;
  const formErr = state && !state.ok ? state.formError : undefined;

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-2">
        <h2 className="font-bold text-brand-text-heading font-heading">Scheme Status</h2>
        <span className="text-xs font-bold uppercase text-brand-text-muted">{currentStatus}</span>
      </div>

      {transitions.length === 0 && (
        <p className="text-sm text-brand-text-muted">
          This scheme is in a terminal state. No further transitions are available.
        </p>
      )}

      {!selected && transitions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {transitions.map((t) => (
            <button
              key={`${t.target}-${t.override}`}
              type="button"
              onClick={() => setSelected(t)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${toneCls[t.tone]}`}
            >
              {t.override && <ShieldAlert size={13} />}
              {t.label}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <form action={action} className="space-y-3 bg-[#F8F9FA] border border-[#EEEEEE] rounded-lg p-4">
          <input type="hidden" name="targetStatus" value={selected.target} />
          <input type="hidden" name="override" value={selected.override ? "true" : "false"} />

          <p className="text-sm font-semibold text-brand-text-heading">
            {selected.label}
            {selected.override && (
              <span className="ml-2 text-[11px] font-bold uppercase text-[#856404]">Governed override</span>
            )}
          </p>

          <div>
            <label className="text-xs font-bold text-brand-text-muted uppercase block mb-1">
              Reason {selected.requiresReason ? "*" : "(optional)"}
            </label>
            <textarea
              name="reason"
              rows={2}
              required={selected.requiresReason}
              aria-invalid={fieldErr ? "true" : "false"}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo resize-none"
              placeholder="Why is this change being made?"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-brand-text-muted uppercase block mb-1">
              Effective date (optional)
            </label>
            <input
              name="effectiveDate"
              type="date"
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo"
            />
          </div>

          {(fieldErr || formErr) && (
            <div role="alert" className="flex items-start gap-2 text-xs text-[#DC3545]">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{fieldErr ?? formErr}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-full border border-[#EEEEEE] px-4 py-1.5 text-xs font-semibold text-brand-text-muted hover:border-brand-indigo transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-brand-indigo px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-secondary transition-colors disabled:opacity-50"
            >
              {pending ? "Applying…" : `Confirm ${selected.label}`}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
