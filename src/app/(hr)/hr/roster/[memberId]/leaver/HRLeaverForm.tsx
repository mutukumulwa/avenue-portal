"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, ArrowLeft, UserMinus } from "lucide-react";
import { submitLeaverRequestAction, type LeaverResult } from "./actions";
import {
  EVIDENCE_PLACEHOLDER,
  MAX_EVIDENCE_LEN,
} from "@/lib/endorsement-evidence";
import { formatCalendarDate } from "@/lib/calendar-date";

/**
 * UAT-HF P08.01 — "Report an employee leaving" (DEF-004).
 *
 * Deliberately a separate form from Add Member. The run found that Roster's "Add
 * Member" and Endorsements' "+ New Endorsement" both landed on the same
 * Member Addition page, so the portal had one shape of request and the leaver
 * had nowhere to go. Reusing that form with a type dropdown would have kept the
 * add-only assumption and buried the leaver a selection deep.
 */

type Dependant = { id: string; name: string };

export function HRLeaverForm({
  memberId,
  memberName,
  memberNumber,
  coverStartLabel,
  dependants,
}: {
  memberId: string;
  memberName: string;
  memberNumber: string;
  coverStartLabel: string | null;
  dependants: Dependant[];
}) {
  const [lastDay, setLastDay] = useState("");
  const [result, setResult] = useState<LeaverResult>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const fieldErrors = result?.ok === false ? (result.fieldErrors ?? {}) : {};
  const formError = result?.ok === false ? result.error : null;

  const err = (name: string) => fieldErrors[name]?.[0];
  const describedBy = (name: string) => (err(name) ? `${name}-error` : undefined);

  const inputCls = (name: string) =>
    `w-full border rounded-[8px] px-3 py-2 text-sm outline-none transition-all bg-white ${
      err(name)
        ? "border-[#DC3545] focus:ring-2 focus:ring-[#DC3545]"
        : "border-[#EEEEEE] focus:ring-2 focus:ring-brand-indigo focus:border-brand-indigo"
    }`;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(undefined);
    setSubmitting(true);
    try {
      const r = await submitLeaverRequestAction(new FormData(e.currentTarget));
      setResult(r);
    } catch (caught) {
      // A redirect on success throws NEXT_REDIRECT; never show that as a failure.
      if (caught instanceof Error && caught.message === "NEXT_REDIRECT") throw caught;
      setResult({
        ok: false,
        error: "The request could not be submitted. Your entries are still on this page; try again when the connection is stable.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/hr/roster/${memberId}`} className="text-brand-text-muted hover:text-brand-text-heading transition-colors" aria-label="Back to roster">
          <ArrowLeft size={22} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Report an employee leaving</h1>
          <p className="text-brand-text-muted text-sm mt-0.5">
            {memberName} · {memberNumber}
          </p>
        </div>
      </div>

      {/* The single most important thing on this page: submitting changes
          nothing. P08.01's acceptance is "no cover changes before approval", and
          an employer who believes cover ended today will stop checking. */}
      <div className="rounded-[8px] border border-[#17A2B8]/30 bg-[#17A2B8]/5 p-4 flex items-start gap-3">
        <AlertCircle size={16} className="text-[#17A2B8] mt-0.5 shrink-0" />
        <div className="text-sm text-brand-text-body">
          <p className="font-semibold text-brand-text-heading">This does not end cover by itself.</p>
          <p className="text-xs mt-1">
            It sends a request to your scheme administrator. {memberName} stays covered
            until they approve it — including on the last covered day you enter below.
          </p>
        </div>
      </div>

      {formError && (
        <div role="alert" className="flex items-start gap-2 rounded-[8px] border border-[#DC3545]/30 bg-[#DC3545]/5 px-4 py-3 text-sm text-[#DC3545]">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <input type="hidden" name="memberId" value={memberId} />

        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
          <div>
            <label htmlFor="lastDay" className="block text-xs font-bold text-brand-text-muted uppercase mb-1">
              Last day of cover *
            </label>
            <input
              id="lastDay"
              name="lastDay"
              type="date"
              required
              value={lastDay}
              onChange={(e) => setLastDay(e.target.value)}
              aria-invalid={!!err("lastDay")}
              aria-describedby={describedBy("lastDay")}
              className={inputCls("lastDay")}
            />
            {/* The readback P08.01 asks for. "Last day of cover" and "date cover
                ends" differ by one day, and that day is a day of claims — so the
                product states which one it means, in words, rather than trusting
                the label to be read the intended way. */}
            {lastDay && !err("lastDay") && (
              <p className="text-xs text-brand-text-body mt-2 bg-[#F8F9FA] border border-[#EEEEEE] rounded p-2">
                {memberName} stays covered <strong>through the whole of {formatCalendarDate(lastDay)}</strong>,
                and is not covered from the following day.
                {dependants.length > 0 && (
                  <> The same applies to {dependants.length} dependant{dependants.length === 1 ? "" : "s"}.</>
                )}
              </p>
            )}
            {coverStartLabel && (
              <p className="text-[11px] text-brand-text-muted mt-1">Cover started {coverStartLabel}.</p>
            )}
            {err("lastDay") && (
              <p id="lastDay-error" role="alert" className="text-xs text-[#DC3545] mt-1">{err("lastDay")}</p>
            )}
          </div>

          <div>
            <label htmlFor="reason" className="block text-xs font-bold text-brand-text-muted uppercase mb-1">
              Reason for leaving *
            </label>
            <input
              id="reason"
              name="reason"
              type="text"
              required
              maxLength={300}
              placeholder="e.g. Resignation, contract ended, retirement"
              aria-invalid={!!err("reason")}
              aria-describedby={describedBy("reason")}
              className={inputCls("reason")}
            />
            {err("reason") && (
              <p id="reason-error" role="alert" className="text-xs text-[#DC3545] mt-1">{err("reason")}</p>
            )}
          </div>

          <div>
            <label htmlFor="sourceReference" className="block text-xs font-bold text-brand-text-muted uppercase mb-1">
              Supporting document reference *
            </label>
            <input
              id="sourceReference"
              name="sourceReference"
              type="text"
              required
              maxLength={MAX_EVIDENCE_LEN}
              placeholder={EVIDENCE_PLACEHOLDER}
              aria-invalid={!!err("sourceReference")}
              aria-describedby={describedBy("sourceReference") ?? "sourceReference-help"}
              className={inputCls("sourceReference")}
            />
            <p id="sourceReference-help" className="text-xs text-brand-text-muted mt-1">
              The resignation letter, exit form or payroll instruction. Your
              administrator cannot approve this without it.
            </p>
            {err("sourceReference") && (
              <p id="sourceReference-error" role="alert" className="text-xs text-[#DC3545] mt-1">{err("sourceReference")}</p>
            )}
          </div>
        </div>

        {/* Ending a principal ends the household. The run's DEF-031 work showed
            how easily dependants are forgotten; naming them is cheaper than
            discovering them at a counter. */}
        {dependants.length > 0 && (
          <div className="rounded-[8px] border border-[#FFC107]/40 bg-[#FFC107]/10 p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-[#856404] mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-[#856404]">
                {dependants.length} dependant{dependants.length === 1 ? "" : "s"} lose cover too
              </p>
              <ul className="text-xs text-brand-text-muted mt-1 list-disc pl-4">
                {dependants.map((d) => <li key={d.id}>{d.name}</li>)}
              </ul>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Link
            href={`/hr/roster/${memberId}`}
            className="px-5 py-2.5 text-sm font-semibold text-brand-text-muted hover:text-brand-text-heading transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="bg-[#DC3545] hover:bg-[#c82333] text-white px-6 py-2.5 rounded-full font-bold text-sm transition-colors flex items-center gap-2 disabled:opacity-60"
          >
            <UserMinus size={15} />
            {submitting ? "Sending…" : "Send leaver request"}
          </button>
        </div>
      </form>
    </div>
  );
}
