"use client";

/**
 * F5.8 correction / F5.10 resubmission — rebuilt on the shared provider capture
 * controls under Family Hospital UAT plan P04.02.
 *
 * Kept from F5.8/F5.10: the earlier claim is never edited in place; member and
 * branch are fixed to the earlier claim (the server takes them from it, never
 * from this form); a reason can be given; submission needs an explicit
 * confirmation and cannot happen twice; a stale earlier claim refreshes the page.
 *
 * Changed (P04.02): no global CPT or ICD list is loaded into the page — the
 * diagnosis is searched and services come from the facility's own price list,
 * exactly as on a new claim. Lines are seeded from the earlier claim's STORED
 * data: a line captured from the price list shows its stored name and rate; any
 * other line is marked "Historical / unlisted" and is carried exactly as it was
 * unless the user changes it (then it is judged afresh against the contract for
 * the correction's service date). Historical prices are never silently replaced.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BenefitCategory, ServiceType } from "@prisma/client";
import { Lock, Save } from "lucide-react";
import Decimal from "decimal.js";
import { correctProviderClaimAction } from "./actions";
import { ErrorSummary } from "@/components/forms/ErrorSummary";
import { MutationOutcome } from "@/components/forms/MutationOutcome";
import { ProviderMemberField, type MemberFieldChange } from "@/components/provider/ProviderMemberField";
import { BenefitSelect, ServiceDateField, ServiceTypeSelect } from "@/components/provider/CaseFields";
import { DiagnosisCombobox } from "@/components/provider/DiagnosisCombobox";
import { ServiceLineEditor, clearSelections, lineElementId, linesTotal, pricingBasis, toCaptureLineInputs, type CaptureLineState } from "@/components/provider/ServiceLineEditor";
import { claimFieldLabels, disabledLinesReason, firstErrors } from "@/components/provider/claim-form-support";
import { CAPTURE_BUTTON_PRIMARY, CAPTURE_ERROR, CAPTURE_HINT, CAPTURE_INPUT, CAPTURE_LABEL } from "@/components/provider/capture-styles";
import { isControlFlowError, mutationFail, type MutationFailure } from "@/lib/mutation-contract";
import { newOperationId } from "@/lib/correlation";
import { EXAMPLES } from "@/lib/locale-config";
import { formatGroupedAmount } from "@/lib/money";
import {
  contextRefFrom,
  type ClaimReplacementCaptureSubmission,
  type DiagnosisOption,
  type ReplacementSubmitResult,
} from "@/lib/provider-capture-contract";

/** The correction/resubmission action shape (both share the F5.7 replacement contract). */
export type ReplacementSubmitAction = (input: ClaimReplacementCaptureSubmission) => Promise<ReplacementSubmitResult>;

/** Built on the server from the earlier claim (src/server/services/provider-claim-seed.ts). */
export interface CorrectionSeed {
  member: { memberRef: string; branchId: string | null; displayName: string };
  branchName: string | null;
  serviceType: ServiceType;
  benefitCategory: BenefitCategory;
  serviceDate: string;
  attendingDoctor: string;
  diagnosis: DiagnosisOption | null;
  lines: CaptureLineState[];
  originalBilled: string;
  currency: string;
}

const IDS = {
  member: "cf-member",
  serviceDate: "cf-dos",
  benefitCategory: "cf-benefit",
  serviceType: "cf-stype",
  attendingDoctor: "cf-doctor",
  diagnosis: "cf-diag",
  lines: "cf-lines",
} as const;

export function CorrectClaimForm({
  predecessorClaimId,
  predecessorNumber,
  today,
  seed,
  mode = "correct",
  submitAction = correctProviderClaimAction,
}: {
  predecessorClaimId: string;
  predecessorNumber: string;
  /** Kampala today (YYYY-MM-DD), from the server. */
  today: string;
  seed: CorrectionSeed;
  /** "correct" (F5.8, supersedes a pre-decision claim) or "resubmit" (F5.10, links a new claim while the original stays declined). */
  mode?: "correct" | "resubmit";
  submitAction?: ReplacementSubmitAction;
}) {
  const copy =
    mode === "resubmit"
      ? { verb: "resubmission", reasonLabel: "Reason for resubmission (optional)", totalLabel: "Resubmitted total", submit: "Submit resubmission", submitting: "Submitting resubmission…" }
      : { verb: "correction", reasonLabel: "Reason for correction (optional)", totalLabel: "Corrected total", submit: "Submit correction", submitting: "Submitting correction…" };

  const [serviceDate, setServiceDate] = useState(seed.serviceDate);
  const [benefitCategory, setBenefitCategory] = useState<BenefitCategory>(seed.benefitCategory);
  const [serviceType, setServiceType] = useState<ServiceType>(seed.serviceType);
  const [attendingDoctor, setAttendingDoctor] = useState(seed.attendingDoctor);
  const [diagnosis, setDiagnosis] = useState<DiagnosisOption | null>(seed.diagnosis);
  const [lines, setLines] = useState<CaptureLineState[]>(seed.lines);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [caseState, setCaseState] = useState<MemberFieldChange>({ context: null, outcome: null });
  const [failure, setFailure] = useState<MutationFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // A stable draft id for THIS correction — the idempotency key, so a double click
  // or a retry after an unknown outcome replays instead of filing twice.
  const [draftId, setDraftId] = useState(() => newOperationId());
  const basis = useRef<string | null>(null);
  const inFlight = useRef(false);
  const router = useRouter();

  const resolved = caseState.outcome === "RESOLVED" ? caseState.context : null;
  const errors = firstErrors(failure);
  const total = linesTotal(lines);
  const original = new Decimal(seed.originalBilled);
  const delta = total.minus(original);

  function onCase(change: MemberFieldChange) {
    setCaseState(change);
    if (change.outcome === "RESOLVED" && change.context) {
      const next = pricingBasis(change.context);
      if (basis.current !== null && basis.current !== next && lines.some((l) => l.selected)) {
        setLines(clearSelections);
        setNotice("The patient's contract changed for this date, so the services chosen from the price list were cleared. Search for them again.");
      }
      basis.current = next;
    }
  }

  function submit() {
    if (!confirmed || pending || inFlight.current) return;
    setNotice(null);
    const local: Record<string, string[]> = {};
    if (!resolved) local.member = [caseState.outcome ? "The patient's cover must be confirmed for this date before filing." : "Waiting for the patient's cover to be confirmed."];
    if (!diagnosis) local.diagnosis = ["Choose the primary diagnosis."];
    if (!resolved || !diagnosis) {
      setFailure(mutationFail("VALIDATION", { message: `The ${copy.verb} was not submitted. Correct the items listed.`, fieldErrors: local }));
      return;
    }
    const payload: ClaimReplacementCaptureSubmission = {
      predecessorClaimId,
      reason: reason.trim() || undefined,
      idempotencyKey: draftId,
      context: contextRefFrom("CLAIM_CORRECTION", resolved),
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
        const res = await submitAction(payload);
        // On success the action redirects; only a refusal returns here.
        if (res && !res.ok) {
          setFailure(res);
          if (res.kind !== "UNKNOWN_OUTCOME") setDraftId(newOperationId());
          if (res.refresh) router.refresh();
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
  const currency = resolved?.currency ?? seed.currency;

  return (
    <div className="space-y-6 rounded-lg border border-[#EEEEEE] bg-white p-6">
      <div className="rounded-lg border border-[#FFC107]/40 bg-[#FFF8E1] px-4 py-3 text-xs text-[#856404]">
        {mode === "resubmit" ? (
          <>
            You are filing a <strong>resubmission</strong> of declined claim <strong>{predecessorNumber}</strong>. Submitting creates a new claim for fresh
            adjudication — the original decline is kept, unchanged, in your submission history. It is not editable in place.
          </>
        ) : (
          <>
            You are filing a <strong>correction</strong> of claim <strong>{predecessorNumber}</strong>. Submitting creates a new claim and supersedes the
            original — the original is kept, unchanged, in your submission history. It is not editable in place.
          </>
        )}
      </div>

      <ErrorSummary failure={failure} fieldOrder={Object.keys(labels)} fieldLabels={labels} fieldElementId={elementId} />
      <MutationOutcome result={failure} checkHref={`/provider/claims/${predecessorClaimId}`} />

      <section aria-labelledby="cf-patient-heading">
        <h2 id="cf-patient-heading" className="mb-4 border-b border-[#EEEEEE] pb-2 font-heading font-bold text-brand-text-heading">
          Patient &amp; encounter
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div id={IDS.member} tabIndex={-1} className="md:col-span-2">
            <ProviderMemberField
              purpose="CLAIM_CORRECTION"
              serviceDate={serviceDate}
              benefitCategory={benefitCategory}
              onChange={onCase}
              fieldError={errors.member}
              memberNumberExample={EXAMPLES.memberNumber}
              fixedMember={seed.member}
            />
            <p className={CAPTURE_HINT}>
              <Lock size={10} className="-mt-0.5 inline" aria-hidden="true" /> A {copy.verb} cannot move the claim to another member
              {seed.branchName ? <> or away from branch <strong>{seed.branchName}</strong></> : null}.
            </p>
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
            <DiagnosisCombobox id={IDS.diagnosis} purpose="CLAIM_CORRECTION" value={diagnosis} onChange={setDiagnosis} error={errors.diagnosis} />
          </div>
        </div>
      </section>

      <section aria-labelledby="cf-lines-heading">
        <h2 id="cf-lines-heading" className="mb-4 border-b border-[#EEEEEE] pb-2 font-heading font-bold text-brand-text-heading">
          <span id={IDS.lines} tabIndex={-1}>Services</span>
        </h2>
        {notice ? <p role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900">{notice}</p> : null}
        <ServiceLineEditor
          purpose="CLAIM_CORRECTION"
          context={resolved}
          lines={lines}
          onChange={setLines}
          errors={errors}
          disabledReason={disabledLinesReason(caseState) ?? "Confirming the patient's cover for this date…"}
        />
        <p className="mt-2 text-right text-[11px] text-brand-text-muted">
          {copy.totalLabel} {currency} {formatGroupedAmount(total.toString())} · was {seed.currency} {formatGroupedAmount(seed.originalBilled)}
          {!delta.isZero() ? <> · {delta.isPositive() ? "+" : "−"}{currency} {formatGroupedAmount(delta.abs().toString())}</> : null}
        </p>
      </section>

      <div>
        <label htmlFor="cf-reason" className={CAPTURE_LABEL}>{copy.reasonLabel}</label>
        <input
          id="cf-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={280}
          placeholder="e.g. corrected a mis-keyed unit price (no clinical detail)"
          className={CAPTURE_INPUT}
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-brand-text-body">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
        <span>I confirm the member, branch, dates, diagnosis, services, quantities and charges above are correct for this claim.</span>
      </label>

      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={pending || !confirmed} className={CAPTURE_BUTTON_PRIMARY}>
          <Save size={16} aria-hidden="true" /> {pending ? copy.submitting : copy.submit}
        </button>
      </div>
    </div>
  );
}
