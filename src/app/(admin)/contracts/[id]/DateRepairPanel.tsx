/**
 * UAT-HF P02.03 — the recovery route DEF-050 said did not exist.
 *
 * From the run: "The record cannot be reached to be fixed: /contracts/{id}/edit
 * returns 'Page Not Found', so there is no UI action that can void, delete or
 * correct the offending row. The module is dead until someone changes code or
 * edits the database directly." It was ultimately fixed by deleting the row
 * against the database, out of band.
 *
 * This panel appears **only** on a contract whose stored dates cannot be
 * rendered, and it is deliberately governed rather than a quick edit: a contract
 * term is a signed agreement, so a correction needs a reason, a source document
 * and a second pair of eyes. P02.02 already stopped the damage spreading, which
 * is what makes a slower, approved repair acceptable.
 */
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { MAX_CALENDAR_DATE, MIN_CALENDAR_DATE } from "@/lib/calendar-date";
import { applyContractDateRepairAction, requestContractDateRepairAction } from "../actions";

const field = "mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm";
const label = "block text-xs font-medium text-[#6C757D]";

export interface DateRepairPanelProps {
  contractId: string;
  contractNumber: string;
  /** How each stored value looks now — already rendered safely by the caller. */
  current: { startDate: string; endDate: string; reviewDueDate: string };
  /** True once a different user has approved the proposal. */
  hasApprovedRepair: boolean;
  /** True when a proposal is waiting for a checker. */
  hasPendingRepair: boolean;
}

export function DateRepairPanel({
  contractId,
  contractNumber,
  current,
  hasApprovedRepair,
  hasPendingRepair,
}: DateRepairPanelProps) {
  return (
    <section
      role="region"
      aria-labelledby="date-repair-heading"
      className="rounded-xl border border-[#FD7E14]/40 bg-[#FD7E14]/5 p-5"
    >
      <h2 id="date-repair-heading" className="flex items-center gap-2 text-sm font-semibold text-[#9a4b06]">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        This contract has a term date the system cannot read
      </h2>

      <p className="mt-2 text-sm text-[#6C757D]">
        Its dates are shown as “invalid” everywhere and any date-dependent action is unavailable until they are
        corrected. Nothing else about {contractNumber} is affected — its tariffs, applicability and versions are intact,
        and the contract is never deleted.
      </p>

      <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <dt className="text-[#6C757D]">Stored start</dt>
          <dd className="font-mono text-[#9a4b06]">{current.startDate}</dd>
        </div>
        <div>
          <dt className="text-[#6C757D]">Stored end</dt>
          <dd className="font-mono text-[#9a4b06]">{current.endDate}</dd>
        </div>
        <div>
          <dt className="text-[#6C757D]">Stored review due</dt>
          <dd className="font-mono text-[#9a4b06]">{current.reviewDueDate}</dd>
        </div>
      </dl>

      {hasApprovedRepair ? (
        <form action={applyContractDateRepairAction} className="mt-4 flex items-center gap-3">
          <input type="hidden" name="id" value={contractId} />
          <ShieldCheck className="h-4 w-4 text-[#0E7C66]" aria-hidden="true" />
          <p className="text-sm text-[#000523]">
            A correction has been approved by another user and is ready to apply.
          </p>
          <button
            type="submit"
            className="ml-auto rounded-full bg-[#0B1437] px-5 py-2 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#06B9AB]"
          >
            Apply approved correction
          </button>
        </form>
      ) : hasPendingRepair ? (
        <p className="mt-4 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#6C757D]">
          A correction has been proposed and is waiting for a different authorised user to approve it on the Overrides
          console. You cannot approve your own proposal.
        </p>
      ) : (
        <form action={requestContractDateRepairAction} className="mt-4 space-y-3">
          <input type="hidden" name="id" value={contractId} />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label} htmlFor="repair-start">
                Correct start date
              </label>
              <input
                id="repair-start"
                type="date"
                name="startDate"
                required
                min={MIN_CALENDAR_DATE}
                max={MAX_CALENDAR_DATE}
                className={field}
              />
            </div>
            <div>
              <label className={label} htmlFor="repair-end">
                Correct end date
              </label>
              <input
                id="repair-end"
                type="date"
                name="endDate"
                required
                min={MIN_CALENDAR_DATE}
                max={MAX_CALENDAR_DATE}
                className={field}
              />
            </div>
            <div>
              <label className={label} htmlFor="repair-review">
                Review due (optional)
              </label>
              <input
                id="repair-review"
                type="date"
                name="reviewDueDate"
                min={MIN_CALENDAR_DATE}
                max={MAX_CALENDAR_DATE}
                className={field}
              />
            </div>
          </div>

          <div>
            <label className={label} htmlFor="repair-source">
              Source document reference <span className="text-brand-error">*</span>
            </label>
            <input
              id="repair-source"
              name="sourceDocumentRef"
              required
              placeholder="e.g. signed agreement PC-2026-202 rev B, held in DMS"
              className={field}
            />
            <p className="mt-1 text-xs text-[#6C757D]">
              A contract term is a signed agreement — name the document the corrected dates come from.
            </p>
          </div>

          <div>
            <label className={label} htmlFor="repair-reason">
              Reason for the correction <span className="text-brand-error">*</span>
            </label>
            <textarea id="repair-reason" name="justification" required rows={2} minLength={10} className={field} />
          </div>

          <button
            type="submit"
            className="rounded-full bg-[#0B1437] px-5 py-2 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#06B9AB]"
          >
            Propose correction for approval
          </button>
        </form>
      )}
    </section>
  );
}
