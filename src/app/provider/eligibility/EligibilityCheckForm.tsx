"use client";

/**
 * UAT-HF P03.05 — the eligibility form, posting rather than navigating.
 *
 * DEF-057: the member-number field was pre-filled with "e.g. NWSC-2026-00001",
 * disclosing to every front desk on the network that NWSC is a client and
 * exactly how its member numbers are formed — which also hands out a starting
 * point for guessing valid ones. The example now comes from `locale-config`
 * and is obviously illustrative.
 *
 * DEF-079: submitting used GET, so the number entered went into the URL, the
 * browser history of a shared desk machine, the access log and the Referer of
 * anything the page then linked to. It now posts through a Server Action.
 */
import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Search, ShieldAlert, XCircle } from "lucide-react";
import { EXAMPLES } from "@/lib/locale-config";
import {
  BENEFIT_OPTIONS,
  EMPTY_ELIGIBILITY_STATE,
  MAX_MEMBER_LEN,
  checkEligibilityAction,
  type EligibilityCheckState,
} from "./actions";

export function EligibilityCheckForm({ memberNumberExample }: { memberNumberExample?: string }) {
  const [state, formAction, pending] = useActionState<EligibilityCheckState, FormData>(
    checkEligibilityAction,
    EMPTY_ELIGIBILITY_STATE,
  );

  const result = state.result;
  const eligible = result?.resultCode === "ELIGIBLE";
  const example = memberNumberExample ?? EXAMPLES.memberNumber;

  return (
    <div className="space-y-6">
      <form action={formAction} className="flex flex-wrap items-end gap-2" noValidate>
        <div className="relative min-w-[200px] flex-1">
          <label htmlFor="elig-q" className="mb-1 block text-[11px] font-bold uppercase text-brand-text-muted">
            Member / card number
          </label>
          <Search size={16} className="absolute left-3 top-[34px] -translate-y-1/2 text-brand-text-muted" aria-hidden="true" />
          <input
            id="elig-q"
            name="q"
            required
            aria-required="true"
            maxLength={MAX_MEMBER_LEN}
            aria-invalid={state.inputError ? true : undefined}
            aria-describedby={state.inputError ? "elig-error" : undefined}
            // DEF-057: an illustrative example, never a live client's scheme.
            placeholder={`e.g. ${example}`}
            className="w-full rounded-lg border border-[#EEEEEE] py-2 pl-9 pr-3 text-sm focus:border-brand-indigo focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="elig-date" className="mb-1 block text-[11px] font-bold uppercase text-brand-text-muted">
            Service date
          </label>
          <input
            id="elig-date"
            name="serviceDate"
            type="date"
            defaultValue={state.submitted?.serviceDate ?? ""}
            className="rounded-lg border border-[#EEEEEE] px-3 py-2 text-sm focus:border-brand-indigo focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="elig-benefit" className="mb-1 block text-[11px] font-bold uppercase text-brand-text-muted">
            Benefit
          </label>
          <select
            id="elig-benefit"
            name="benefit"
            defaultValue={state.submitted?.benefit ?? ""}
            className="rounded-lg border border-[#EEEEEE] px-3 py-2 text-sm focus:border-brand-indigo focus:outline-none"
          >
            <option value="">Any</option>
            {BENEFIT_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {b.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-secondary disabled:opacity-60"
        >
          {pending ? "Checking…" : "Check"}
        </button>
      </form>

      {state.inputError && (
        <div
          id="elig-error"
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-[#DC3545]/30 bg-[#DC3545]/5 px-4 py-3 text-sm font-semibold text-[#DC3545]"
        >
          <AlertCircle size={16} aria-hidden="true" /> {state.inputError}
        </div>
      )}

      {/*
        P03.02's distinction, made visible: an outage is NOT a refusal of cover.
        DEF-053 recorded that an outage was indistinguishable from ineligibility.
      */}
      {state.unavailable && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <ShieldAlert size={16} className="mt-0.5" aria-hidden="true" />
          <span>
            <strong>We could not check cover just now.</strong> This is a temporary problem on our side and is{" "}
            <strong>not</strong> a refusal of cover. Try again shortly; if it is urgent, follow the manual verification
            process.
          </span>
        </div>
      )}

      {result && !result.found && (
        <div
          role="status"
          className="rounded-lg border border-[#DC3545]/30 bg-[#DC3545]/5 px-4 py-3 text-sm font-semibold text-[#DC3545]"
        >
          {/*
            The number entered is deliberately NOT echoed back. The run noted the
            old message "echoes the raw input unnormalised", which both reflects
            unvalidated text and confirms what was tried on a shared screen.
          */}
          <p>{result.decision.memberSafeExplanation}</p>
          {/*
            P03.03: the collapsed member-safe line above is the same for a wrong
            card, an out-of-entitlement member and a facility with no cover
            agreement — that protects against enumeration. The operator still
            needs to know WHICH it is, and DEF-053's message told them to check a
            card that was often never the problem.
          */}
          <p className="mt-1 font-normal text-brand-text-body">{result.decision.operatorGuidance}</p>
        </div>
      )}

      {result?.found && (
        <div role="status" aria-live="polite" className="overflow-hidden rounded-lg border border-[#EEEEEE] bg-white">
          <div className={`flex items-center gap-3 px-5 py-4 ${eligible ? "bg-[#28A745]/5" : "bg-[#DC3545]/5"}`}>
            {eligible ? (
              <CheckCircle2 className="text-[#28A745]" size={28} aria-hidden="true" />
            ) : (
              <XCircle className="text-[#DC3545]" size={28} aria-hidden="true" />
            )}
            <div>
              <p className="text-lg font-bold text-brand-text-heading">
                {result.member!.firstName} {result.member!.lastName}{" "}
                <span className="font-mono text-sm text-brand-text-muted">{result.member!.memberNumber}</span>
              </p>
              <p className={`text-sm font-semibold ${eligible ? "text-[#28A745]" : "text-[#DC3545]"}`}>
                {eligible ? "ELIGIBLE — cover is active" : "NOT ELIGIBLE"}
              </p>
              {result.decision.memberSafeExplanation && (
                <p className="mt-0.5 text-xs text-brand-text-muted">{result.decision.memberSafeExplanation}</p>
              )}
              {/* DEF-058: "cover is active but this benefit is exhausted" must be
                  readable as exactly that, not as "not eligible". */}
              <p className="mt-1 text-xs font-medium text-brand-text-body">{result.decision.operatorGuidance}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-5 text-sm md:grid-cols-3">
            <div>
              <dt className="text-[11px] font-bold uppercase text-brand-text-muted">Scheme</dt>
              <dd className="mt-0.5">{result.schemeName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase text-brand-text-muted">Package</dt>
              <dd className="mt-0.5">{result.packageName ?? "—"}</dd>
            </div>
            {result.requiresPreauth && (
              <div>
                <dt className="text-[11px] font-bold uppercase text-brand-text-muted">Pre-auth</dt>
                <dd className="mt-0.5 font-semibold text-[#856404]">Required</dd>
              </div>
            )}
          </dl>
          <div className="px-5 pb-4 text-xs text-brand-text-muted">{result.disclaimer}</div>
          {eligible && result.memberId && (
            <div className="px-5 pb-5">
              <Link
                href={`/provider/claims/new?memberId=${result.memberId}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-secondary"
              >
                File a claim for this member →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
