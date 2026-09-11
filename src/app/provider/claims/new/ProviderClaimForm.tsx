"use client";

/**
 * Family Hospital UAT plan P04.01 — "File a claim", rebuilt on the shared
 * provider capture controls (FH-02, FH-04, FH-05, FH-06, FH-07, FH-09, FH-10,
 * FH-12).
 *
 * What the facility met: a member number that looked nothing up, a native list
 * of 500 diagnoses that could not find "malaria", a benefit list without
 * inpatient or surgical, a "CPT" box that silently replaced the description,
 * price and category with a Kenyan demo average labelled UGX, and a browser
 * UTC date as the default service date.
 *
 * Now: the member is resolved by the server (name, masked number, cover); the
 * service date is the server's Kampala date; the diagnosis is searched; services
 * come from the facility's own price list inside the chosen category, and can
 * only be added once the member resolves to an eligible case. The form sends
 * references (member, tariff ids, diagnosis code) and the billed prices — the
 * server re-derives everything else and refuses a stale case.
 *
 * On a refused submit every value stays, and the error summary takes focus and
 * links to each field. A double click cannot file twice: submission is locked
 * while pending, and the draft's idempotency key makes a retry a replay. The key
 * is renewed after a refusal that saved nothing, and kept when the outcome is
 * unknown — so a retry then replays instead of filing again.
 */
import { useRef, useState, useTransition } from "react";
import type { BenefitCategory, ServiceType } from "@prisma/client";
import { Save } from "lucide-react";
import { submitProviderClaimAction } from "./actions";
import { ErrorSummary } from "@/components/forms/ErrorSummary";
import { MutationOutcome } from "@/components/forms/MutationOutcome";
import { ProviderMemberField, type MemberFieldChange } from "@/components/provider/ProviderMemberField";
import { BenefitSelect, ServiceDateField, ServiceTypeSelect } from "@/components/provider/CaseFields";
import { DiagnosisCombobox } from "@/components/provider/DiagnosisCombobox";
import {
  ServiceLineEditor,
  clearSelections,
  lineElementId,
  newLine,
  pricingBasis,
  toCaptureLineInputs,
  type CaptureLineState,
} from "@/components/provider/ServiceLineEditor";
import { CAPTURE_BUTTON_PRIMARY, CAPTURE_ERROR, CAPTURE_INPUT, CAPTURE_LABEL } from "@/components/provider/capture-styles";
import { isControlFlowError, mutationFail, type MutationFailure } from "@/lib/mutation-contract";
import { newOperationId } from "@/lib/correlation";
import { EXAMPLES } from "@/lib/locale-config";
import { contextRefFrom, type ClaimCaptureSubmission, type DiagnosisOption } from "@/lib/provider-capture-contract";
import { claimFieldLabels, disabledLinesReason, firstErrors } from "@/components/provider/claim-form-support";

const IDS = {
  member: "claim-member",
  serviceDate: "claim-dos",
  benefitCategory: "claim-benefit",
  serviceType: "claim-stype",
  attendingDoctor: "claim-doctor",
  diagnosis: "claim-diagnosis",
  lines: "claim-lines",
} as const;

export interface ClaimHandoff {
  memberRef: string;
  branchId: string | null;
  serviceDate: string;
  benefitCategory: BenefitCategory | null;
}

export function ProviderClaimForm({ today, handoff }: { today: string; handoff: ClaimHandoff | null }) {
  const [serviceDate, setServiceDate] = useState(handoff?.serviceDate ?? today);
  const [benefitCategory, setBenefitCategory] = useState<BenefitCategory>(handoff?.benefitCategory ?? "OUTPATIENT");
  const [serviceType, setServiceType] = useState<ServiceType>("OUTPATIENT");
  const [attendingDoctor, setAttendingDoctor] = useState("");
  const [diagnosis, setDiagnosis] = useState<DiagnosisOption | null>(null);
  // A fixed key for the first line: it is rendered on the server too, and a
  // random one would differ between the server's HTML and the browser's.
  const [lines, setLines] = useState<CaptureLineState[]>(() => [{ ...newLine("CONSULTATION"), key: "first" }]);
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
    // A quick local check, never authority: the server repeats all of it.
    const local: Record<string, string[]> = {};
    if (!resolved) local.member = [caseState.outcome ? "This member cannot be claimed for as shown. Resolve the member first." : "Find the member first."];
    if (!diagnosis) local.diagnosis = ["Choose the primary diagnosis."];
    if (!resolved || !diagnosis) {
      setFailure(mutationFail("VALIDATION", { message: "The claim was not submitted. Correct the items listed.", fieldErrors: local }));
      return;
    }

    const payload: ClaimCaptureSubmission = {
      idempotencyKey: draftId,
      context: contextRefFrom("CLAIM", resolved),
      expectedContractVersionId: resolved.contract?.versionId ?? null,
      serviceType,
      attendingDoctor: attendingDoctor.trim() || undefined,
      diagnosisCode: diagnosis.code,
      lines: toCaptureLineInputs(lines),
    };
    inFlight.current = true;
    setFailure(null);
    startTransition(async () => {
      try {
        const res = await submitProviderClaimAction(payload);
        // Success redirects; only a refusal comes back.
        if (res && !res.ok) {
          setFailure(res);
          // Nothing was saved ⇒ a fresh key for the corrected claim. Unknown ⇒ keep
          // it, so trying again replays rather than filing a second claim.
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

  const labels = claimFieldLabels(lines);
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
      <MutationOutcome result={failure} checkHref="/provider/claims" />

      <section aria-labelledby="claim-patient-heading">
        <h2 id="claim-patient-heading" className="mb-4 border-b border-[#EEEEEE] pb-2 font-heading font-bold text-brand-text-heading">
          Patient &amp; encounter
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <ProviderMemberField
              inputId={IDS.member}
              purpose="CLAIM"
              serviceDate={serviceDate}
              benefitCategory={benefitCategory}
              onChange={onCase}
              fieldError={errors.member}
              memberNumberExample={EXAMPLES.memberNumber}
              handoff={handoff ? { memberRef: handoff.memberRef, branchId: handoff.branchId } : null}
            />
          </div>
          <ServiceDateField id={IDS.serviceDate} value={serviceDate} max={today} onChange={setServiceDate} error={errors.serviceDate} />
          <BenefitSelect id={IDS.benefitCategory} value={benefitCategory} onChange={(v) => v && setBenefitCategory(v)} error={errors.benefitCategory} />
          <ServiceTypeSelect id={IDS.serviceType} value={serviceType} onChange={setServiceType} />
          <div>
            <label htmlFor={IDS.attendingDoctor} className={CAPTURE_LABEL}>Attending clinician</label>
            <input
              id={IDS.attendingDoctor}
              value={attendingDoctor}
              maxLength={200}
              autoComplete="off"
              aria-invalid={errors.attendingDoctor ? true : undefined}
              onChange={(e) => setAttendingDoctor(e.target.value)}
              placeholder={EXAMPLES.practitionerName}
              className={CAPTURE_INPUT}
            />
            {errors.attendingDoctor ? <p className={CAPTURE_ERROR} role="alert">{errors.attendingDoctor}</p> : null}
          </div>
          <div className="md:col-span-2">
            <DiagnosisCombobox id={IDS.diagnosis} purpose="CLAIM" value={diagnosis} onChange={setDiagnosis} error={errors.diagnosis} />
          </div>
        </div>
      </section>

      <section aria-labelledby="claim-lines-heading">
        <h2 id="claim-lines-heading" className="mb-4 border-b border-[#EEEEEE] pb-2 font-heading font-bold text-brand-text-heading">
          <span id={IDS.lines} tabIndex={-1}>Services</span>
        </h2>
        {notice ? (
          <p role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900">{notice}</p>
        ) : null}
        <ServiceLineEditor
          purpose="CLAIM"
          context={resolved}
          lines={lines}
          onChange={setLines}
          errors={errors}
          disabledReason={disabledLinesReason(caseState)}
        />
      </section>

      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={pending} aria-disabled={pending || undefined} className={CAPTURE_BUTTON_PRIMARY}>
          <Save size={16} aria-hidden="true" /> {pending ? "Submitting…" : "Submit claim"}
        </button>
      </div>
    </div>
  );
}
