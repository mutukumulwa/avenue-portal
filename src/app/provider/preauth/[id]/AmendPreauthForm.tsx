"use client";

/**
 * Request more on an APPROVED pre-authorisation — Family Hospital UAT plan
 * P04.03, on the shared capture controls.
 *
 * Before: a CPT box, a free-text service and a number box that read "600,000"
 * as nothing. Now the additional services are searched in the facility's own
 * price list (inside a category) for the parent's member, date and benefit; the
 * estimate is suggested from the contracted rate, stays editable and is shown
 * apart from it; amounts are parsed as decimals.
 */
import { useRef, useState, useTransition } from "react";
import type { BenefitCategory } from "@prisma/client";
import { AlertCircle, PlusCircle } from "lucide-react";
import { amendProviderPreauthAction } from "./actions";
import { ProviderMemberField, type MemberFieldChange } from "@/components/provider/ProviderMemberField";
import { ServiceLineEditor, clearSelections, newLine, pricingBasis, toCaptureLineInputs, type CaptureLineState } from "@/components/provider/ServiceLineEditor";
import { disabledLinesReason, firstErrors } from "@/components/provider/claim-form-support";
import { CAPTURE_ERROR, CAPTURE_INPUT, CAPTURE_LABEL } from "@/components/provider/capture-styles";
import { isControlFlowError, mutationFail, type MutationFailure } from "@/lib/mutation-contract";
import { EXAMPLES } from "@/lib/locale-config";
import { contextRefFrom } from "@/lib/provider-capture-contract";

export function AmendPreauthForm({
  parentPreAuthId,
  member,
  serviceDate,
  benefitCategory,
}: {
  parentPreAuthId: string;
  /** The parent's member — fixed; an amendment cannot change patient. */
  member: { memberRef: string; displayName: string };
  /** The parent's expected date (Kampala), fixed by the server. */
  serviceDate: string;
  /** The parent's benefit, fixed. */
  benefitCategory: BenefitCategory;
}) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<CaptureLineState[]>(() => [{ ...newLine("PROCEDURE"), key: "first" }]);
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [caseState, setCaseState] = useState<MemberFieldChange>({ context: null, outcome: null });
  const [failure, setFailure] = useState<MutationFailure | null>(null);
  const [pending, start] = useTransition();
  const basis = useRef<string | null>(null);
  const inFlight = useRef(false);

  const resolved = caseState.outcome === "RESOLVED" ? caseState.context : null;
  const errors = firstErrors(failure);
  const messages = failure ? [failure.message, ...Object.values(errors)].filter((m, i, all) => m && all.indexOf(m) === i) : [];

  function onCase(change: MemberFieldChange) {
    setCaseState(change);
    if (change.outcome === "RESOLVED" && change.context) {
      const next = pricingBasis(change.context);
      if (basis.current !== null && basis.current !== next) setLines(clearSelections);
      basis.current = next;
    }
  }

  function submit() {
    if (pending || inFlight.current) return;
    if (!resolved) {
      setFailure(mutationFail("VALIDATION", { message: "Wait until the patient's cover is confirmed, then submit." }));
      return;
    }
    inFlight.current = true;
    setFailure(null);
    start(async () => {
      try {
        const res = await amendProviderPreauthAction({
          parentPreAuthId,
          context: contextRefFrom("PREAUTH", resolved),
          expectedContractVersionId: resolved.contract?.versionId ?? null,
          lines: toCaptureLineInputs(lines),
          clinicalNotes: clinicalNotes.trim() || undefined,
        });
        // Success redirects to the amendment; only a refusal returns here.
        if (res && !res.ok) setFailure(res);
      } catch (err) {
        if (isControlFlowError(err)) throw err;
        setFailure(mutationFail("UNKNOWN_OUTCOME", { message: "We could not confirm whether the amendment was created. Refresh this page to check before trying again." }));
      } finally {
        inFlight.current = false;
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-brand-indigo/40 px-3 py-1.5 text-xs font-semibold text-brand-indigo hover:bg-brand-indigo/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/60"
      >
        <PlusCircle size={14} aria-hidden="true" /> Amend (request more)
      </button>
    );
  }

  return (
    <section aria-labelledby="amend-heading" className="w-full space-y-3 rounded-lg border border-brand-indigo/30 bg-brand-indigo/5 p-4">
      <h2 id="amend-heading" className="text-sm font-semibold text-brand-indigo">Request additional cover on this approved pre-authorisation</h2>
      {messages.length ? (
        <div className="flex items-start gap-2 text-sm text-[#DC3545]" role="alert">
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <ul>{messages.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      ) : null}
      <ProviderMemberField
        purpose="PREAUTH"
        serviceDate={serviceDate}
        benefitCategory={benefitCategory}
        onChange={onCase}
        fieldError={errors.member}
        memberNumberExample={EXAMPLES.memberNumber}
        fixedMember={{ memberRef: member.memberRef, branchId: null, displayName: member.displayName }}
      />
      <ServiceLineEditor
        purpose="PREAUTH"
        mode="estimate"
        context={resolved}
        lines={lines}
        onChange={setLines}
        errors={errors}
        disabledReason={disabledLinesReason(caseState) ?? "Confirming the patient's cover…"}
      />
      <div>
        <label htmlFor="amend-notes" className={CAPTURE_LABEL}>Clinical justification (optional)</label>
        <textarea id="amend-notes" className={`${CAPTURE_INPUT} min-h-[70px]`} maxLength={2000} value={clinicalNotes} onChange={(e) => setClinicalNotes(e.target.value)} />
        {errors.clinicalNotes ? <p className={CAPTURE_ERROR} role="alert">{errors.clinicalNotes}</p> : null}
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setFailure(null); }}
          className="rounded-full px-3 py-1.5 text-xs font-semibold text-brand-text-body hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/60"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-full bg-brand-indigo px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/60 disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit amendment"}
        </button>
      </div>
    </section>
  );
}
