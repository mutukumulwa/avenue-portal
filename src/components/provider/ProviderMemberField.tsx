"use client";

/**
 * Family Hospital UAT plan P03.01 / FH-04 — the provider member field.
 *
 * "The client's name does not populate after entering the member number — even
 * up to the Submit Claim stage." The name only ever appeared when the page was
 * reached from an eligibility result; typing a number looked nothing up. This
 * field resolves the number on an explicit "Find member" (or on leaving the
 * box) through the one server-side case resolver, and shows ONLY: name, a
 * masked number, scheme/package and cover status.
 *
 * States (P03.01): empty, resolving, found/eligible, found/ineligible, not
 * found, stale, unavailable, forbidden-safe — plus branch-required and
 * no-contract, which the resolver can also return. Each is announced through a
 * polite live region, carries text (never colour alone), and an error after an
 * explicit lookup takes focus so it is perceivable without sight.
 *
 * A response that arrives after a newer lookup is ignored, and a resolved case
 * is discarded the moment the number, service date, benefit or branch changes.
 * The member number travels in a POST body only (a Server Action), never a URL.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { BenefitCategory } from "@prisma/client";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Search, ShieldAlert, UserX, XCircle } from "lucide-react";
import { resolveCaseContextAction } from "@/app/provider/capture-actions";
import type { CaseContextDTO, CaseContextOutcome, CapturePurpose } from "@/lib/provider-capture-contract";
import { CAPTURE_BUTTON_SECONDARY, CAPTURE_ERROR, CAPTURE_HINT, CAPTURE_INPUT, CAPTURE_LABEL } from "./capture-styles";

type Status = "empty" | "resolving" | "found" | "ineligible" | "not_found" | "stale" | "unavailable" | "forbidden" | "no_contract" | "branch_required" | "invalid";

export interface MemberFieldChange {
  context: CaseContextDTO | null;
  outcome: CaseContextOutcome | null;
}

export function ProviderMemberField({
  purpose,
  serviceDate,
  benefitCategory,
  onChange,
  fieldError,
  memberNumberExample,
  handoff,
  fixedMember,
  inputId: inputIdProp,
}: {
  purpose: CapturePurpose;
  serviceDate: string;
  benefitCategory: BenefitCategory;
  onChange: (change: MemberFieldChange) => void;
  /** A server-side error from the last submit. */
  fieldError?: string;
  memberNumberExample: string;
  /** Eligibility → claim hand-off: resolve this opaque reference on mount. */
  handoff?: { memberRef: string; branchId: string | null } | null;
  /** Correction / amendment: the member is fixed; re-resolve on every change of date or benefit. */
  fixedMember?: { memberRef: string; branchId: string | null; displayName: string } | null;
  /** A stable id for the number box, so an error summary can link to it. */
  inputId?: string;
}) {
  const autoId = useId();
  const inputId = inputIdProp ?? `member-${autoId}`;
  const statusId = `${inputId}-status`;
  const [memberNumber, setMemberNumber] = useState("");
  const [memberRef, setMemberRef] = useState<string | null>(fixedMember?.memberRef ?? handoff?.memberRef ?? null);
  const [branchId, setBranchId] = useState<string | null>(fixedMember?.branchId ?? handoff?.branchId ?? null);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }> | null>(null);
  const [status, setStatus] = useState<Status>(memberRef ? "resolving" : "empty");
  const [context, setContext] = useState<CaseContextDTO | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const seq = useRef(0);
  const lastKey = useRef<string | null>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const focusOnResult = useRef(false);

  // ELIG-GAP-019 (kept from the old claim form): recover a number typed into
  // the box BEFORE React hydrated — a fast clerk on a slow device. Without
  // this, hydrating the controlled input discards those keystrokes.
  useEffect(() => {
    const typed = numberRef.current?.value;
    if (typed && typed !== memberNumber) setMemberNumber(typed);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only, by design
  }, []);

  const emit = useCallback((ctx: CaseContextDTO | null, outcome: CaseContextOutcome | null) => onChange({ context: ctx, outcome }), [onChange]);

  const resolve = useCallback(
    async (opts: { explicit: boolean; branch?: string | null } = { explicit: false }) => {
      const typed = memberNumber.trim();
      const ref = typed ? null : memberRef;
      if (!typed && !ref) return;
      const useBranch = opts.branch !== undefined ? opts.branch : branchId;
      const key = [typed || `ref:${ref}`, serviceDate, benefitCategory, useBranch ?? ""].join("|");
      const mine = ++seq.current;
      lastKey.current = key;
      focusOnResult.current = opts.explicit;
      setStatus("resolving");
      setMessage(null);
      let result;
      try {
        result = await resolveCaseContextAction({ purpose, memberNumber: typed || undefined, memberRef: ref ?? undefined, branchId: useBranch, serviceDate, benefitCategory });
      } catch {
        if (mine !== seq.current) return;
        setContext(null);
        setStatus("unavailable");
        setMessage("Member lookup is temporarily unavailable. Try again shortly.");
        emit(null, "UNAVAILABLE");
        return;
      }
      if (mine !== seq.current) return; // a newer lookup superseded this one
      if (!result || typeof result !== "object") {
        setContext(null);
        setStatus("unavailable");
        setMessage("Member lookup is temporarily unavailable. Try again shortly.");
        emit(null, "UNAVAILABLE");
        return;
      }
      switch (result.outcome) {
        case "RESOLVED":
          setContext(result.context);
          setMemberRef(result.context.memberRef);
          setBranchId(result.context.branch.id);
          setBranches(null);
          setStatus("found");
          emit(result.context, "RESOLVED");
          break;
        case "INELIGIBLE":
          setContext(result.context);
          setMemberRef(result.context.memberRef);
          setStatus("ineligible");
          setMessage(result.message);
          emit(result.context, "INELIGIBLE");
          break;
        case "NO_ACTIVE_CONTRACT":
        case "AMBIGUOUS_CONTRACT":
          setContext(result.context);
          setMemberRef(result.context.memberRef);
          setStatus("no_contract");
          setMessage(result.message);
          emit(result.context, result.outcome);
          break;
        case "BRANCH_REQUIRED":
          setContext(null);
          setBranches(result.branches ?? []);
          setStatus("branch_required");
          setMessage(result.message);
          emit(null, "BRANCH_REQUIRED");
          break;
        default:
          setContext(null);
          setStatus(result.outcome === "NOT_FOUND" ? "not_found" : result.outcome === "FORBIDDEN" ? "forbidden" : result.outcome === "INVALID" ? "invalid" : "unavailable");
          setMessage(result.fieldErrors?.memberNumber ?? result.fieldErrors?.serviceDate ?? result.message);
          emit(null, result.outcome);
      }
    },
    [benefitCategory, branchId, emit, memberNumber, memberRef, purpose, serviceDate],
  );

  // Hand-off / fixed member: resolve ONCE, on mount, for the reference the page
  // supplied. Keyed to the initial prop — not to `memberRef` state, which every
  // successful lookup sets and which must not trigger a second lookup (and a
  // second eligibility evidence row).
  const initialRef = useRef<string | null>(fixedMember?.memberRef ?? handoff?.memberRef ?? null);
  useEffect(() => {
    if (!initialRef.current) return;
    initialRef.current = null;
    void resolve({ explicit: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only, by design
  }, []);

  // A change of date or benefit invalidates the resolved case (P02.02 step 3).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (status === "empty") return;
    // Drop anything in flight too: a lookup started for the old date must not
    // land after the date changed.
    seq.current += 1;
    setContext(null);
    emit(null, null);
    if (fixedMember) {
      void resolve({ explicit: false });
    } else {
      setStatus("stale");
      setMessage("The service date or benefit changed. Find the member again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only date/benefit changes invalidate
  }, [serviceDate, benefitCategory]);

  // An explicit lookup that failed moves focus to the explanation.
  useEffect(() => {
    if (focusOnResult.current && message && status !== "found" && status !== "resolving") {
      focusOnResult.current = false;
      messageRef.current?.focus();
    }
  }, [message, status]);

  const tone =
    status === "found"
      ? { icon: <CheckCircle2 size={18} className="text-[#28A745]" aria-hidden="true" />, label: "Covered on this date", cls: "border-[#28A745]/30 bg-[#28A745]/5" }
      : status === "ineligible"
        ? { icon: <XCircle size={18} className="text-[#DC3545]" aria-hidden="true" />, label: "Not eligible on this date", cls: "border-[#DC3545]/30 bg-[#DC3545]/5" }
        : status === "no_contract"
          ? { icon: <ShieldAlert size={18} className="text-[#856404]" aria-hidden="true" />, label: "No contract price available", cls: "border-amber-300 bg-amber-50" }
          : null;

  return (
    <div className="space-y-2">
      {fixedMember ? (
        <p className="text-sm">
          <span className={CAPTURE_LABEL}>Member</span>
          <span className="font-semibold text-brand-text-heading">{fixedMember.displayName}</span>
        </p>
      ) : (
        <div>
          <label htmlFor={inputId} className={CAPTURE_LABEL}>
            Member / card number<span aria-hidden="true"> *</span>
          </label>
          <div className="flex gap-2">
            <input
              ref={numberRef}
              id={inputId}
              value={memberNumber}
              maxLength={64}
              autoComplete="off"
              aria-invalid={fieldError || status === "not_found" || status === "invalid" ? true : undefined}
              aria-describedby={statusId}
              placeholder={`e.g. ${memberNumberExample}`}
              onChange={(e) => {
                setMemberNumber(e.target.value);
                if (context || memberRef || status !== "empty") {
                  seq.current += 1;
                  setContext(null);
                  setMemberRef(null);
                  setStatus("empty");
                  setMessage(null);
                  emit(null, null);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void resolve({ explicit: true });
                }
              }}
              onBlur={() => {
                const typed = memberNumber.trim();
                const key = [typed, serviceDate, benefitCategory, branchId ?? ""].join("|");
                if (typed.length >= 4 && key !== lastKey.current) void resolve({ explicit: false });
              }}
              className={CAPTURE_INPUT}
            />
            <button type="button" onClick={() => void resolve({ explicit: true })} disabled={!memberNumber.trim() || status === "resolving"} className={CAPTURE_BUTTON_SECONDARY}>
              {status === "resolving" ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Search size={14} aria-hidden="true" />} Find member
            </button>
          </div>
        </div>
      )}

      {status === "branch_required" && branches ? (
        <div>
          <label htmlFor={`${inputId}-branch`} className={CAPTURE_LABEL}>Branch where the patient is seen *</label>
          <select
            id={`${inputId}-branch`}
            value={branchId ?? ""}
            onChange={(e) => {
              setBranchId(e.target.value || null);
              if (e.target.value) void resolve({ explicit: true, branch: e.target.value });
            }}
            className={CAPTURE_INPUT}
          >
            <option value="">Choose a branch…</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      <div id={statusId} role="status" aria-live="polite">
        {status === "resolving" ? <p className={CAPTURE_HINT}>Looking up the member…</p> : null}
        {context && tone ? (
          <div className={`rounded-lg border px-3 py-2 ${tone.cls}`}>
            <div className="flex items-center gap-2">
              {tone.icon}
              <p className="text-sm font-bold text-brand-text-heading">
                {context.displayName} <span className="font-mono text-xs font-normal text-brand-text-muted">{context.maskedMemberNumber}</span>
              </p>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-brand-text-body">{tone.label}</p>
            <p className="text-xs text-brand-text-muted">
              {[context.schemeName, context.packageName, context.branch.name].filter(Boolean).join(" · ")}
              {context.currency ? ` · Prices in ${context.currency}` : ""}
            </p>
          </div>
        ) : null}
        {message && status !== "found" ? (
          <p
            ref={messageRef}
            tabIndex={-1}
            className={`flex items-start gap-1.5 text-xs ${status === "unavailable" ? "text-amber-900" : "font-semibold text-[#DC3545]"} focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/60`}
          >
            {status === "not_found" ? <UserX size={13} aria-hidden="true" className="mt-0.5" /> : status === "stale" ? <RefreshCw size={13} aria-hidden="true" className="mt-0.5" /> : <AlertCircle size={13} aria-hidden="true" className="mt-0.5" />}
            <span>{message}</span>
          </p>
        ) : null}
      </div>
      {fieldError ? <p className={CAPTURE_ERROR} role="alert">{fieldError}</p> : null}
    </div>
  );
}
