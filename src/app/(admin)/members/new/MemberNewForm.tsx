"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutationAction } from "@/components/forms/useMutationAction";
import { ErrorSummary } from "@/components/forms/ErrorSummary";
import { MutationOutcome } from "@/components/forms/MutationOutcome";
import { DraftBanner, DraftSavedIndicator } from "@/components/forms/DraftBanner";
import { useFormDraft, readFormValues } from "@/components/forms/useFormDraft";
import { useDirtyFormGuard } from "@/components/forms/useDirtyFormGuard";
import { MEMBER_ENROLMENT_DRAFT, type DraftScope } from "@/lib/draft-store";
import { EXAMPLES } from "@/lib/locale-config";
import { addMemberAction, type MemberCreated } from "./actions";
import { Save, AlertTriangle } from "lucide-react";
import { SessionExpiryGuard } from "@/components/layouts/SessionExpiryGuard";
import {
  calendarDateReadback,
  todayCalendarDate,
} from "@/lib/calendar-date";
import { resolveMemberEnrolmentDates } from "@/lib/member-enrolment";
import { MEMBER_ADDRESS_COUNTRY } from "@/lib/member-address";

const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo transition-colors";
const labelCls = "text-xs font-bold text-brand-text-muted uppercase block mb-1";
const ENROLMENT_FIELD_ORDER = [
  "groupId", "relationship", "effectiveDate", "firstName", "lastName",
  "dateOfBirth", "gender", "idNumber", "birthNotificationDate", "phone", "email",
  "addressDistrict", "addressLocality", "addressSubcounty", "addressParish",
  "addressVillage", "addressLine", "addressLatitude", "addressLongitude",
  "addressCoordinateConsent",
];
const ENROLMENT_FIELD_LABELS: Record<string, string> = {
  groupId: "Group",
  relationship: "Relationship",
  effectiveDate: "Effective date",
  firstName: "First name",
  lastName: "Last name",
  dateOfBirth: "Date of birth",
  gender: "Gender",
  idNumber: "National ID / Passport",
  birthNotificationDate: "Birth notification date",
  phone: "Phone number",
  email: "Email address",
  addressDistrict: "District",
  addressLocality: "City / municipality / county",
  addressSubcounty: "Subcounty / division",
  addressParish: "Parish / ward",
  addressVillage: "Village / zone",
  addressLine: "Building / street / landmark",
  addressLatitude: "Latitude",
  addressLongitude: "Longitude",
  addressCoordinateConsent: "Coordinate consent",
};

interface Props {
  groups: { id: string; name: string }[];
  /** Set when adding a dependant from a principal's page (NW-D02). */
  principal?: {
    id: string;
    name: string;
    memberNumber: string;
    groupId: string;
    groupName: string;
  } | null;
  /** UAT-HF P04.02 — scopes the draft to this tenant and this operator. */
  draftScope?: DraftScope | null;
}

export function MemberNewForm({ groups, principal, draftScope = null }: Props) {
  /**
   * UAT-HF P04.01 — DEF-034. This form already carried `disabled={pending}` at
   * the tested build and the double-click still lost the enrolment: React's
   * `pending` does not flip until the transition starts, so a fast second click
   * lands on a live control and aborts the first submit.
   *
   * `useMutationAction` mints ONE operation id per mounted draft and resends it,
   * so the server recognises the second click as the same intent (P01.02) and
   * replays instead of writing again — or losing the work.
   */
  const { state, formAction: action, pending, operationId } = useMutationAction<MemberCreated>(addMemberAction);
  const warnings = state?.ok ? (state.data?.warnings ?? []) : [];

  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // State, not a ref: `useDirtyFormGuard` registers a `beforeunload` listener in
  // an effect, so it has to re-run when the form first becomes dirty. A ref
  // would change without re-rendering and the tab-close warning would never
  // arm — which is the DEF-008 symptom, reintroduced.
  const [isDirty, setIsDirty] = useState(false);
  const [dateValues, setDateValues] = useState<Record<string, string>>({
    effectiveDate: todayCalendarDate(),
    relationship: principal ? "SPOUSE" : "PRINCIPAL",
  });
  const [coordinateConsent, setCoordinateConsent] = useState(false);

  /**
   * UAT-HF P04.02 — DEF-071. Nothing was kept while the operator typed, and a
   * closed tab produced a blank form with no statement that anything was lost.
   * The draft is written to tab-scoped storage as they work and offered back
   * EXPLICITLY; it is never silently poured into the fields.
   */
  const draft = useFormDraft(draftScope, MEMBER_ENROLMENT_DRAFT);

  // DEF-008 / DEF-016: no unsaved-change warning on any exit path.
  const { confirmDiscard } = useDirtyFormGuard(isDirty);

  const onFormInput = useCallback(() => {
    if (!formRef.current) return;
    setIsDirty(true);
    const values = readFormValues(formRef.current);
    setDateValues(values);
    setCoordinateConsent(values.addressCoordinateConsent === "on");
    draft.capture(values);
  }, [draft]);

  const applyDraft = useCallback(() => {
    const values = draft.restore();
    const form = formRef.current;
    if (!values || !form) return;
    for (const [name, value] of Object.entries(values)) {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
        if (field instanceof HTMLInputElement && field.type === "checkbox") {
          field.checked = value === "on" || value === "true";
        } else {
          field.value = value;
        }
      }
    }
    const restored = readFormValues(form);
    setDateValues(restored);
    setCoordinateConsent(restored.addressCoordinateConsent === "on");
    setIsDirty(true);
  }, [draft]);

  // A successful enrolment is the end of this draft's life — leaving it would
  // offer the just-enrolled member's details back on the next visit.
  const submitted = state?.ok === true;
  useEffect(() => {
    if (submitted) {
      setIsDirty(false);
      draft.clear();
    }
    // `draft.clear` is stable per scope; re-running on every draft change would
    // wipe the live draft mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  const onCancel = useCallback(() => {
    if (!confirmDiscard()) return;
    draft.clear();
    setIsDirty(false);
    router.push(principal ? `/members/${principal.id}` : "/members");
  }, [confirmDiscard, draft, router, principal]);

  const failure = state && !state.ok ? state : null;
  const errorFor = (field: string) => failure?.fieldErrors?.[field]?.[0];
  const a11y = (field: string) => ({
    id: field,
    "aria-invalid": !!errorFor(field),
    "aria-describedby": errorFor(field) ? `${field}-error` : undefined,
  });
  const inlineError = (field: string) =>
    errorFor(field) ? (
      <p id={`${field}-error`} role="alert" className="mt-1 text-xs text-brand-error">
        {errorFor(field)}
      </p>
    ) : null;
  const dateResolution = resolveMemberEnrolmentDates({
    dateOfBirth: dateValues.dateOfBirth,
    effectiveDate: dateValues.effectiveDate,
    birthNotificationDate: dateValues.birthNotificationDate,
    relationship: dateValues.relationship,
  });

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-6">
      {/* Field-level problems, focus-managed (P01.01). */}
      <ErrorSummary
        failure={failure}
        fieldOrder={ENROLMENT_FIELD_ORDER}
        fieldLabels={ENROLMENT_FIELD_LABELS}
      />

      {/*
        Every non-validation outcome gets its own distinct state, including
        "we could not confirm whether this was saved" — which is what a dropped
        response after a commit actually is, and what DEF-034's blank form hid.
      */}
      <div className="mb-5">
        <MutationOutcome
          result={state}
          nextHref={state?.ok && state.data?.memberId ? `/members/${state.data.memberId}` : undefined}
          checkHref={`/api/operations/${operationId}`}
        />
      </div>

      {warnings.length > 0 && (
        <div className="mb-5 bg-[#FFC107]/5 border border-[#FFC107]/40 rounded-lg px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-[#856404]">
            <AlertTriangle size={15} className="shrink-0" />
            <p className="text-sm font-bold">Member enrolled — enrollment risk flags detected</p>
          </div>
          <ul className="space-y-1 pl-5 list-disc">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-[#856404]">{w}</li>
            ))}
          </ul>
          <p className="text-xs text-[#856404]">The member has been added. Please review these flags before proceeding.</p>
        </div>
      )}

      {/* DEF-071: an explicitly labelled draft, with the time it was kept.
          Restoring is a decision the operator makes, never something that
          happens to them. */}
      <DraftBanner draft={draft.offered} onRestore={applyDraft} onDiscard={draft.discard} />

      {/* DEF-010: guard the submit against an expired idle session so the user
          gets a clear re-login instead of native validation bubbles or a silent
          redirect. The server action still fails closed (requireRole). */}
      <SessionExpiryGuard>
      <form ref={formRef} action={action} onInput={onFormInput} onChange={onFormInput} className="space-y-6">
        {/* NW-D02: carry the principal link so the dependant attaches to its family. */}
        {principal && <input type="hidden" name="principalId" value={principal.id} />}

        {principal && (
          <div className="rounded-lg bg-brand-indigo/5 border border-brand-indigo/20 px-4 py-3 text-sm">
            <p className="font-semibold text-brand-text-heading">
              Dependant of {principal.name}{" "}
              <span className="font-mono text-xs text-brand-text-muted">({principal.memberNumber})</span>
            </p>
            <p className="text-xs text-brand-text-muted mt-0.5">
              This member will be linked to {principal.name} and enrolled in the same scheme
              ({principal.groupName}).
            </p>
          </div>
        )}

        {/* Group & Relationship */}
        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Policy & Group</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="groupId" className={labelCls}>Group *</label>
              {principal ? (
                <>
                  <input type="hidden" name="groupId" value={principal.groupId} />
                  <input
                    {...a11y("groupId")}
                    value={principal.groupName}
                    readOnly
                    className={`${inputCls} bg-[#F8F9FA] text-brand-text-muted`}
                  />
                </>
              ) : (
                <select {...a11y("groupId")} required name="groupId" className={inputCls}>
                  <option value="">Select group…</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
              {inlineError("groupId")}
            </div>
            <div>
              <label htmlFor="relationship" className={labelCls}>Relationship *</label>
              {/*
                UAT-HF P05.03 — DEF-031 (S2). "Selecting Relationship 'Child'
                (or Spouse/Parent/Sibling) presents no principal selector at all
                ... Submitting creates a live ACTIVE dependant with no principal,
                no family unit and its own full Annual Limit of UGX 25,000,000,
                with no warning at any point."

                The acceptance allows either requiring a principal or refusing
                the relationship. This refuses: the correct route already exists
                and carries the link, so offering a second route that silently
                orphans is the whole defect. The dependant options are gone from
                the generic form, and the note says where they live.
              */}
              <select {...a11y("relationship")} required name="relationship" defaultValue={principal ? "SPOUSE" : "PRINCIPAL"} className={inputCls}>
                {principal ? (
                  <>
                    <option value="SPOUSE">Spouse</option>
                    <option value="CHILD">Child</option>
                    <option value="PARENT">Parent</option>
                    <option value="SIBLING">Sibling</option>
                  </>
                ) : (
                  <option value="PRINCIPAL">Principal</option>
                )}
              </select>
              {inlineError("relationship")}
              {!principal && (
                <p className="text-[10px] text-brand-text-muted mt-1">
                  This form enrols a principal. To add a spouse, child, parent or sibling, open the
                  principal&rsquo;s profile and use <strong>Add Dependent</strong> — that links them
                  to the family unit so they share its limits.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="effectiveDate" className={labelCls}>Effective Date *</label>
              <input
                {...a11y("effectiveDate")}
                required
                name="effectiveDate"
                type="date"
                defaultValue={todayCalendarDate()}
                className={inputCls}
              />
              <p className="text-[10px] text-brand-text-muted mt-1">Cover start — drives eligibility from this date.</p>
              {inlineError("effectiveDate")}
            </div>
          </div>
        </div>

        {/* Personal Information */}
        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Personal Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className={labelCls}>First Name *</label>
              <input {...a11y("firstName")} required name="firstName" type="text" placeholder="e.g. John" className={inputCls} />
              {inlineError("firstName")}
            </div>
            <div>
              <label htmlFor="lastName" className={labelCls}>Last Name *</label>
              <input {...a11y("lastName")} required name="lastName" type="text" placeholder="e.g. Doe" className={inputCls} />
              {inlineError("lastName")}
            </div>
            <div>
              <label htmlFor="dateOfBirth" className={labelCls}>Date of Birth *</label>
              <input {...a11y("dateOfBirth")} required name="dateOfBirth" type="date" className={inputCls} />
              {inlineError("dateOfBirth")}
            </div>
            <div>
              <label htmlFor="gender" className={labelCls}>Gender *</label>
              <select {...a11y("gender")} required name="gender" className={inputCls}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
              {inlineError("gender")}
            </div>
            <div className="col-span-2">
              <label htmlFor="idNumber" className={labelCls}>National ID / Passport</label>
              <input {...a11y("idNumber")} name="idNumber" type="text" placeholder="e.g. 12345678" className={inputCls} />
              <p className="text-[10px] text-brand-text-muted mt-1">Used for duplicate detection — must be unique across all members. Newborns may be enrolled without an ID.</p>
              {inlineError("idNumber")}
            </div>
            <div className="col-span-2">
              <label htmlFor="birthNotificationDate" className={labelCls}>Birth Notification Date <span className="font-normal text-brand-text-muted normal-case">(newborns only)</span></label>
              <input {...a11y("birthNotificationDate")} name="birthNotificationDate" type="date" className={inputCls} />
              <p className="text-[10px] text-brand-text-muted mt-1">When a birth is notified within 30 days, cover starts from the date of birth (no national ID required).</p>
              {inlineError("birthNotificationDate")}
            </div>
            {dateResolution.ok && (
              <div role="status" className="col-span-2 rounded-lg border border-brand-indigo/20 bg-brand-indigo/5 px-4 py-3 text-sm text-brand-text-heading">
                <p>{calendarDateReadback(dateResolution.value.requestedEffectiveDate, "Requested cover start")}</p>
                <p className="font-semibold">
                  {calendarDateReadback(dateResolution.value.coverStartDate, "Resulting cover start")}
                </p>
                {dateResolution.value.newbornRuleApplied && (
                  <p className="mt-1 text-xs text-brand-text-muted">
                    Newborn rule applied: notification was within 30 days, so cover starts on the exact date of birth.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Contact */}
        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Contact Information <span className="font-normal text-brand-text-muted">(optional)</span></h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="phone" className={labelCls}>Phone Number</label>
              <input {...a11y("phone")} name="phone" type="tel" placeholder={EXAMPLES.phone} className={inputCls} />
              <p className="text-[10px] text-brand-text-muted mt-1">Uganda format: +256 772 555 042 or 0772 555 042.</p>
              {inlineError("phone")}
            </div>
            <div>
              <label htmlFor="email" className={labelCls}>Email Address</label>
              <input {...a11y("email")} name="email" type="email" placeholder="user@example.com" className={inputCls} />
              {inlineError("email")}
            </div>
          </div>
        </div>

        {/* DEF-033: the tested form had no way to record any part of a Uganda
            address. The hierarchy is optional, but once started the district is
            required. Coordinates are a separate, explicit-consent choice. */}
        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">
            Address <span className="font-normal text-brand-text-muted">(optional)</span>
          </h3>
          <input type="hidden" name="addressCountry" value={MEMBER_ADDRESS_COUNTRY} />
          <p className="mb-3 text-xs text-brand-text-muted">Country: <strong>Uganda</strong></p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              ["addressDistrict", "District", "e.g. Wakiso"],
              ["addressLocality", "City / Municipality / County", "e.g. Kira Municipality"],
              ["addressSubcounty", "Subcounty / Division", "e.g. Namugongo Division"],
              ["addressParish", "Parish / Ward", "e.g. Kyaliwajjala"],
              ["addressVillage", "Village / Zone", "e.g. Buwate"],
              ["addressLine", "Building / Street / Landmark", "Optional directions or landmark"],
            ] as const).map(([name, label, placeholder]) => (
              <div key={name} className={name === "addressLine" ? "md:col-span-2" : undefined}>
                <label htmlFor={name} className={labelCls}>{label}</label>
                <input {...a11y(name)} name={name} type="text" maxLength={name === "addressLine" ? 200 : 100} placeholder={placeholder} className={inputCls} />
                {inlineError(name)}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-[#EEEEEE] bg-[#F8F9FA] p-4 space-y-3">
            <label htmlFor="addressCoordinateConsent" className="flex items-start gap-2 text-sm text-brand-text-heading">
              <input
                {...a11y("addressCoordinateConsent")}
                name="addressCoordinateConsent"
                type="checkbox"
                className="mt-1"
              />
              <span>I confirm the member consented to storing precise coordinates for authorized location-based workflows.</span>
            </label>
            {inlineError("addressCoordinateConsent")}
            {coordinateConsent && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="addressLatitude" className={labelCls}>Latitude *</label>
                  <input {...a11y("addressLatitude")} required name="addressLatitude" inputMode="decimal" placeholder="0.347596" className={inputCls} />
                  {inlineError("addressLatitude")}
                </div>
                <div>
                  <label htmlFor="addressLongitude" className={labelCls}>Longitude *</label>
                  <input {...a11y("addressLongitude")} required name="addressLongitude" inputMode="decimal" placeholder="32.582520" className={inputCls} />
                  {inlineError("addressLongitude")}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* DEF-008: the form exposed exactly one action, "Register Member" —
            no Cancel, Discard or Back control existed anywhere on it, so an
            operator had no labelled way out and the breadcrumb discarded eight
            filled fields with no prompt. */}
        <div className="flex items-center justify-between gap-4 pt-2">
          <DraftSavedIndicator savedAt={draft.savedAt} />
          <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-[#EEEEEE] px-5 py-2 text-sm font-semibold text-brand-text-muted transition-colors hover:bg-[#F8F9FA]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {pending ? "Registering…" : principal ? "Add Dependent" : "Register Member"}
          </button>
          </div>
        </div>
      </form>
      </SessionExpiryGuard>
    </div>
  );
}
