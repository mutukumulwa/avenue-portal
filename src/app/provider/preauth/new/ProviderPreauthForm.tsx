"use client";

/**
 * Family Hospital UAT plan P04.03 — "Request pre-authorisation", rebuilt on the
 * shared provider capture controls (FH-02, FH-04, FH-05, FH-06, FH-07, FH-10,
 * FH-12).
 *
 * Same member lookup, benefit list, diagnosis search and money parser as a
 * claim. Requested services come from the facility's own price list inside a
 * category; picking one suggests its contracted rate as the ESTIMATE, which stays
 * editable and is shown apart from the contracted rate. "600,000" is 600000.
 * The expected date may be today or a planned later day.
 *
 * A refused request keeps every value, focuses the error summary, and renews
 * the draft key, so the corrected request can be sent (before, the same key with
 * new content was an idempotency conflict and could never be resent).
 */
import { useRef, useState, useTransition } from "react";
import type { BenefitCategory, ServiceType } from "@prisma/client";
import { Save } from "lucide-react";
import { submitProviderPreauthAction } from "./actions";
import { ErrorSummary } from "@/components/forms/ErrorSummary";
import { MutationOutcome } from "@/components/forms/MutationOutcome";
import { ProviderMemberField, type MemberFieldChange } from "@/components/provider/ProviderMemberField";
import { BenefitSelect, ServiceDateField, ServiceTypeSelect } from "@/components/provider/CaseFields";
import { DiagnosisCombobox } from "@/components/provider/DiagnosisCombobox";
import { ServiceLineEditor, clearSelections, lineElementId, newLine, pricingBasis, toCaptureLineInputs, type CaptureLineState } from "@/components/provider/ServiceLineEditor";
import { claimFieldLabels, disabledLinesReason, firstErrors } from "@/components/provider/claim-form-support";
import { CAPTURE_BUTTON_PRIMARY, CAPTURE_ERROR, CAPTURE_INPUT, CAPTURE_LABEL } from "@/components/provider/capture-styles";
import { isControlFlowError, mutationFail, type MutationFailure } from "@/lib/mutation-contract";
import { newOperationId } from "@/lib/correlation";
import { EXAMPLES } from "@/lib/locale-config";
import { contextRefFrom, type DiagnosisOption, type PreauthCaptureSubmission } from "@/lib/provider-capture-contract";

const IDS = {
  member: "pa-member",
  serviceDate: "pa-date",
  benefitCategory: "pa-benefit",
  serviceType: "pa-stype",
  diagnosis: "pa-diagnosis",
  lines: "pa-lines",
  clinicalNotes: "pa-notes",
} as const;

export function ProviderPreauthForm({ today }: { today: string }) {
  const [serviceDate, setServiceDate] = useState(today);
  const [benefitCategory, setBenefitCategory] = useState<BenefitCategory>("OUTPATIENT");
  const [serviceType, setServiceType] = useState<ServiceType>("OUTPATIENT");
  const [diagnosis, setDiagnosis] = useState<DiagnosisOption | null>(null);
  const [lines, setLines] = useState<CaptureLineState[]>(() => [{ ...newLine("PROCEDURE"), key: "first" }]);
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [caseState, setCaseState] = useState<MemberFieldChange>({ context: null, outcome: null });
  const [failure, setFailure] = useState<MutationFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draftId, setDraftId] = useState(() => newOperationId());
  const basis = useRef<string | null>(null);
  const inFlight = useRef(false);

  const resolved = caseState.outcome === "RESOLVED" ? caseState.context : null;
  const errors = firstErrors(failure);

  function onCase(change: MemberFieldChange) {
    setCaseState(change);
    if (change.outcome === "RESOLVED" && change.context) {
      const next = pricingBasis(change.context);
      if (basis.current !== null && basis.current !== next && lines.some((l) => l.selected)) {
        setLines(clearSelections);
        setNotice("The patient's contract or branch changed, so the services chosen from the price list were cleared. Search for them again.");
      }
      basis.current = next;
    }
  }

  function submit() {
    if (pending || inFlight.current) return;
    setNotice(null);
    const local: Record<string, string[]> = {};
    if (!resolved) local.member = [caseState.outcome ? "This member cannot be pre-authorised as shown. Resolve the member first." : "Find the member first."];
    if (!diagnosis) local.diagnosis = ["Choose the primary diagnosis."];
    if (!resolved || !diagnosis) {
      setFailure(mutationFail("VALIDATION", { message: "The pre-authorisation was not submitted. Correct the items listed.", fieldErrors: local }));
      return;
    }
    const payload: PreauthCaptureSubmission = {
      idempotencyKey: draftId,
      context: contextRefFrom("PREAUTH", resolved),
      expectedContractVersionId: resolved.contract?.versionId ?? null,
      serviceType,
      diagnosisCode: diagnosis.code,
      lines: toCaptureLineInputs(lines),
      clinicalNotes: clinicalNotes.trim() || undefined,
    };
    inFlight.current = true;
    setFailure(null);
    startTransition(async () => {
      try {
        const res = await submitProviderPreauthAction(payload);
        if (res && !res.ok) {
          setFailure(res);
          // Refused ⇒ nothing was stored under a new request: renew the key so the
          // corrected request is a new one. Unknown ⇒ keep it, so a retry replays.
          if (res.kind !== "UNKNOWN_OUTCOME") setDraftId(newOperationId());
        }
      } catch (err) {
        if (isControlFlowError(err)) throw err;
        setFailure(mutationFail("UNKNOWN_OUTCOME", { operationId: draftId }));
      } finally {
        inFlight.current = false;
      }
    });
  }

  const labels = { ...claimFieldLabels(lines, "estimate"), serviceDate: "Expected date of service", clinicalNotes: "Clinical notes" };
  const elementId = (field: string) => {
    const m = /^lines\.(\d+)\.(service|quantity|billedUnitPrice|description|category)$/.exec(field);
    if (m) {
      const line = lines[Number(m[1])];
      return line ? lineElementId(line, m[2] as Parameters<typeof lineElementId>[1]) : IDS.lines;
    }
    return IDS[field as keyof typeof IDS] ?? IDS.lines;
  };

  return (
    <div className="space-y-6 rounded-lg border border-[#EEEEEE] bg-white p-6">
      <ErrorSummary failure={failure} fieldOrder={Object.keys(labels)} fieldLabels={labels} fieldElementId={elementId} />
      <MutationOutcome result={failure} checkHref="/provider/preauth" />

      <section aria-labelledby="pa-patient-heading">
        <h2 id="pa-patient-heading" className="mb-4 border-b border-[#EEEEEE] pb-2 font-heading font-bold text-brand-text-heading">
          Patient &amp; request
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <ProviderMemberField
              inputId={IDS.member}
              purpose="PREAUTH"
              serviceDate={serviceDate}
              benefitCategory={benefitCategory}
              onChange={onCase}
              fieldError={errors.member}
              memberNumberExample={EXAMPLES.memberNumber}
            />
          </div>
          <ServiceDateField
            id={IDS.serviceDate}
            label="Expected date of service"
            hint="Kampala date. Today is filled in; change it to the planned day if the service is later."
            value={serviceDate}
            onChange={setServiceDate}
            error={errors.serviceDate}
          />
          <BenefitSelect id={IDS.benefitCategory} value={benefitCategory} onChange={(v) => v && setBenefitCategory(v)} error={errors.benefitCategory} />
          <ServiceTypeSelect id={IDS.serviceType} value={serviceType} onChange={setServiceType} />
          <div className="md:col-span-2">
            <DiagnosisCombobox id={IDS.diagnosis} purpose="PREAUTH" value={diagnosis} onChange={setDiagnosis} error={errors.diagnosis} />
          </div>
        </div>
      </section>

      <section aria-labelledby="pa-lines-heading">
        <h2 id="pa-lines-heading" className="mb-4 border-b border-[#EEEEEE] pb-2 font-heading font-bold text-brand-text-heading">
          <span id={IDS.lines} tabIndex={-1}>Requested services</span>
        </h2>
        {notice ? <p role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900">{notice}</p> : null}
        <ServiceLineEditor
          purpose="PREAUTH"
          mode="estimate"
          context={resolved}
          lines={lines}
          onChange={setLines}
          errors={errors}
          disabledReason={disabledLinesReason(caseState)}
        />
      </section>

      <div>
        <label htmlFor={IDS.clinicalNotes} className={CAPTURE_LABEL}>Clinical notes (optional)</label>
        <textarea
          id={IDS.clinicalNotes}
          value={clinicalNotes}
          maxLength={2000}
          aria-invalid={errors.clinicalNotes ? true : undefined}
          onChange={(e) => setClinicalNotes(e.target.value)}
          placeholder="Supporting clinical justification"
          className={`${CAPTURE_INPUT} min-h-[80px]`}
        />
        {errors.clinicalNotes ? <p className={CAPTURE_ERROR} role="alert">{errors.clinicalNotes}</p> : null}
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={pending} className={CAPTURE_BUTTON_PRIMARY}>
          <Save size={16} aria-hidden="true" /> {pending ? "Submitting…" : "Submit pre-authorisation"}
        </button>
      </div>
    </div>
  );
}
